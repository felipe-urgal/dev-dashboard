import type {
  ConfirmedLifecycleRequest,
  ConfirmedLifecycleResult,
  ConfirmedLifecycleStep,
  ServiceLifecyclePlan,
  ServiceLifecyclePlanNode,
} from '@dev-dashboard/contracts';

import { ApiError } from '../http/api-error.js';
import type { ServiceLifecyclePlanningService } from './service-lifecycle-planning-service.js';
import type { ConfirmedLifecycleJobJournal } from './confirmed-lifecycle-job-journal.js';
import { ServiceResourceOperationLock } from './service-resource-operation-lock.js';
import { isSystemdUserUnit } from './confirmed-lifecycle-systemd-evidence.js';

const ACCEPTANCE_TTL_MS = 30_000;

/**
 * A narrow adapter boundary for the existing lifecycle owner.
 * No production adapter or HTTP mutation route is registered by this module.
 */
export interface ConfirmedLifecycleRunner {
  run(
    action: ConfirmedLifecycleRequest['action'],
    node: Readonly<ServiceLifecyclePlanNode>,
    request: Readonly<ConfirmedLifecycleRequest>,
  ): Promise<void>;
}

export interface ConfirmedLifecycleStepWriter {
  append(
    step: ConfirmedLifecycleStep,
    request: ConfirmedLifecycleRequest,
  ): Promise<void>;
}

function conflict(message: string): never {
  throw new ApiError({ statusCode: 409, code: 'CONFLICT', message });
}

function plannedNodes(plan: ServiceLifecyclePlan): ServiceLifecyclePlanNode[] {
  return plan.nodes.filter(
    (node) =>
      node.disposition === 'willStart' || node.disposition === 'willStop',
  );
}

export function confirmedLifecycleResourceKeys(plan: ServiceLifecyclePlan): string[] {
  const keys = [
    'environment:' +
      plan.target.projectId +
      ':' +
      plan.target.environmentInstanceId,
  ];
  for (const node of plan.nodes) {
    // The coordinator holds per-node + environment locks. The Compose
    // lifecycle owner holds compose-project:<projectId> around each actual
    // mutation; acquiring it here too would self-deadlock on the same lease.
    // The systemd user owner acquires both resource:<ref> and its physical
    // unit key. Nested coordinator acquisition would self-conflict.
    // Systemd execution remains disallowed by ensureApproved().
    if (node.provider === 'systemd' && isSystemdUserUnit(node.serviceRef)) continue;
    keys.push('resource:' + node.serviceRef);
  }
  return keys;
}

function compatiblePendingNode(
  actual: ServiceLifecyclePlanNode,
  approved: ServiceLifecyclePlanNode,
): boolean {
  return (
    actual.serviceRef === approved.serviceRef &&
    actual.provider === approved.provider &&
    actual.relation === approved.relation &&
    actual.disposition === approved.disposition &&
    actual.consumerCount === approved.consumerCount &&
    JSON.stringify(actual.dependencies) ===
      JSON.stringify(approved.dependencies) &&
    JSON.stringify(actual.ports) === JSON.stringify(approved.ports)
  );
}

/**
 * Shared execution kernel: validate -> atomically lock -> validate -> perform
 * one adapter step -> verify observation -> repeat. The kernel does not run
 * Docker, systemd or processes itself and is not exposed on the public API.
 */
export class ConfirmedServiceLifecycleCoordinator {
  private readonly now: () => Date;

  public constructor(
    private readonly dependencies: {
      planner: Pick<ServiceLifecyclePlanningService, 'preview'>;
      runner: ConfirmedLifecycleRunner;
      locks: ServiceResourceOperationLock;
      events?: ConfirmedLifecycleStepWriter;
      /** Persistent journal is optional for existing internal test consumers. */
      jobs?: Pick<
        ConfirmedLifecycleJobJournal,
        'begin' | 'beforeStep' | 'step' | 'finish'
      >;
    },
    options: { now?: () => Date } = {},
  ) {
    this.now = options.now ?? (() => new Date());
  }

  public async run(
    request: ConfirmedLifecycleRequest,
  ): Promise<ConfirmedLifecycleResult> {
    const acceptedAt = Date.parse(request.acceptedObservedAt);
    const age = this.now().getTime() - acceptedAt;
    if (!Number.isFinite(acceptedAt) || age < 0 || age > ACCEPTANCE_TTL_MS) {
      conflict(
        'Accepted lifecycle preview expired; refresh and confirm again.',
      );
    }
    if (
      !/^[a-f0-9]{64}$/.test(request.expectedRevision) ||
      !/^[a-f0-9]{64}$/.test(request.expectedPlanHash)
    ) {
      conflict('Missing or invalid lifecycle confirmation revision.');
    }

    const initial = await this.preview(request, request.expectedPlanHash);
    this.ensureApproved(initial, request);
    const approved = plannedNodes(initial);

    return this.dependencies.locks.withResources(
      confirmedLifecycleResourceKeys(initial),
      async () => {
        // Two different projects can share one resource. Revalidate after
        // taking every lock before invoking a provider-owned lifecycle action.
        const locked = await this.preview(request, request.expectedPlanHash);
        this.ensureApproved(locked, request);
        // Durable intent exists BEFORE any provider mutation. A storage error
        // fails closed and cannot turn an uncertain operation into a retry.
        const jobId = this.dependencies.jobs?.begin(
          request,
          approved.map((node) => node.serviceRef),
        );
        const steps: ConfirmedLifecycleStep[] = [];
        const conclude = async (result: ConfirmedLifecycleResult) => {
          if (jobId) this.dependencies.jobs?.finish(jobId, result);
          return result;
        };
        const interrupted = async (
          completedSteps: ConfirmedLifecycleStep[],
          diagnostic: string,
        ) => conclude(this.interrupted(request, completedSteps, diagnostic));
        for (const node of approved) {
          let current: ServiceLifecyclePlan;
          try {
            current = await this.preview(request);
            if (
              current.expectedRevision !== request.expectedRevision ||
              current.status !== 'ready'
            ) {
              return interrupted(
                steps,
                'Lifecycle plan changed before the next step.',
              );
            }
            const observedNode = current.nodes.find(
              (candidate) => candidate.serviceRef === node.serviceRef,
            );
            if (!observedNode || !compatiblePendingNode(observedNode, node)) {
              return interrupted(
                steps,
                'Resource identity, ownership or state changed during lifecycle.',
              );
            }
          } catch {
            return interrupted(
              steps,
              'Resource observation became unavailable during lifecycle.',
            );
          }

          // This adapter boundary deliberately supports only Compose for now.
          // Other providers require their own owner-aware integration.
          // Mark in-flight BEFORE invoking the owner. If the API dies at any
          // point afterward, this job must be reconciled, never replayed.
          if (jobId) this.dependencies.jobs?.beforeStep(jobId, node.serviceRef);
          try {
            await this.dependencies.runner.run(request.action, node, request);
          } catch {
            const failure: ConfirmedLifecycleStep = {
              serviceRef: node.serviceRef,
              action: request.action,
              state: 'failed',
              dispositionBefore: node.disposition,
              diagnostic:
                'The lifecycle owner reported failure; no rollback was attempted.',
            };
            if (jobId) this.dependencies.jobs?.step(jobId, failure);
            steps.push(failure);
            await this.record(request, failure);
            return interrupted(
              steps,
              'Lifecycle owner failed; recovery may be required.',
            );
          }

          let verified = false;
          try {
            const after = await this.preview(request);
            const actual = after.nodes.find(
              (candidate) => candidate.serviceRef === node.serviceRef,
            );
            verified =
              request.action === 'start'
                ? actual?.state === 'running' &&
                  actual.readiness === 'ready' &&
                  actual.disposition === 'alreadyReady'
                : actual?.state === 'stopped';
          } catch {
            // A provider may have mutated state before observation failed.
          }
          const step: ConfirmedLifecycleStep = {
            serviceRef: node.serviceRef,
            action: request.action,
            state: verified ? 'completed' : 'unverified',
            dispositionBefore: node.disposition,
            ...(!verified
              ? {
                  diagnostic:
                    'Lifecycle was invoked but final state is not proven.',
                }
              : {}),
          };
          if (jobId) this.dependencies.jobs?.step(jobId, step);
          steps.push(step);
          await this.record(request, step);
          if (!verified) {
            return interrupted(
              steps,
              'Final service state could not be verified; recovery may be required.',
            );
          }
        }

        return conclude({
          projectId: request.projectId,
          environmentInstanceId: request.environmentInstanceId,
          action: request.action,
          status: 'completed',
          steps,
        });
      },
    );
  }

  private async preview(
    request: ConfirmedLifecycleRequest,
    expectedPlanHash?: string,
  ): Promise<ServiceLifecyclePlan> {
    return this.dependencies.planner.preview(
      request.projectId,
      request.action,
      request.environmentInstanceId,
      expectedPlanHash,
    );
  }

  private ensureApproved(
    plan: ServiceLifecyclePlan,
    request: ConfirmedLifecycleRequest,
  ): void {
    if (
      plan.target.projectId !== request.projectId ||
      plan.target.environmentInstanceId !== request.environmentInstanceId ||
      plan.action !== request.action ||
      plan.expectedRevision !== request.expectedRevision ||
      plan.planHash !== request.expectedPlanHash ||
      plan.status !== 'ready' ||
      plan.executable !== false
    ) {
      conflict(
        'Lifecycle plan is blocked or no longer matches the confirmation.',
      );
    }
    for (const node of plannedNodes(plan)) {
      if (
        node.provider !== 'compose' ||
        node.relation !== 'owned' ||
        node.consumerCount !== 1 ||
        node.disposition !==
          (request.action === 'start' ? 'willStart' : 'willStop')
      ) {
        conflict(
          'Resource lacks a supported, exclusively owned lifecycle adapter.',
        );
      }
    }
  }

  private interrupted(
    request: ConfirmedLifecycleRequest,
    steps: ConfirmedLifecycleStep[],
    diagnostic: string,
  ): ConfirmedLifecycleResult {
    return {
      projectId: request.projectId,
      environmentInstanceId: request.environmentInstanceId,
      action: request.action,
      status: steps.length > 0 ? 'partial' : 'failed',
      steps,
      diagnostic,
    };
  }

  private async record(
    request: ConfirmedLifecycleRequest,
    step: ConfirmedLifecycleStep,
  ): Promise<void> {
    try {
      await this.dependencies.events?.append(step, request);
    } catch {
      // Observability failures must not turn a completed operation into
      // a retry that would mutate the same service twice.
    }
  }
}
