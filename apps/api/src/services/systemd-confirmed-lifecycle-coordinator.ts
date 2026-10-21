import type {
  ConfirmedLifecycleRequest,
  ConfirmedLifecycleResult,
  ConfirmedLifecycleStep,
  ServiceLifecycleAction,
  ServiceLifecyclePlan,
  ServiceLifecyclePlanNode,
} from '@dev-dashboard/contracts';

import { ApiError } from '../http/api-error.js';
import type { ConfirmedLifecycleJobJournal } from './confirmed-lifecycle-job-journal.js';
import type { ConfirmedLifecycleStepWriter } from './confirmed-service-lifecycle-coordinator.js';
import { isSystemdUserUnit } from './confirmed-lifecycle-systemd-evidence.js';
import type { ServiceResourceOperationLock } from './service-resource-operation-lock.js';
import type { SystemdConfirmedLifecycleRunner } from './systemd-confirmed-lifecycle-runner.js';

const TTL_MS = 30_000;
const HASH = /^[a-f0-9]{64}$/;

type FuturePlan = Omit<ServiceLifecyclePlan, 'executable'> & {
  executable: boolean;
};

interface Dependencies {
  planner: {
    preview(
      projectId: string,
      action: ServiceLifecycleAction,
      environmentInstanceId?: string,
      expectedPlanHash?: string,
    ): Promise<FuturePlan>;
  };
  runner: Pick<SystemdConfirmedLifecycleRunner, 'run'>;
  locks: Pick<ServiceResourceOperationLock, 'withResources'>;
  /** Durable intent is mandatory, not optional like in legacy Compose fixtures. */
  jobs: Pick<ConfirmedLifecycleJobJournal, 'begin' | 'beforeStep' | 'step' | 'finish'>;
  events: ConfirmedLifecycleStepWriter;
}

function deny(): never {
  throw new ApiError({
    statusCode: 409,
    code: 'CONFLICT',
    message: 'Systemd confirmation is unavailable or no longer current.',
  });
}

function fresh(value: string, now: number): boolean {
  const time = Date.parse(value);
  return Number.isFinite(time) && time <= now && now - time <= TTL_MS;
}

function approved(
  plan: FuturePlan,
  request: ConfirmedLifecycleRequest,
  now: number,
  accepted: boolean,
): ServiceLifecyclePlanNode {
  const node = plan.nodes[0];
  if (
    plan.target.kind !== 'project-environment' ||
    plan.target.projectId !== request.projectId ||
    plan.target.environmentInstanceId !== request.environmentInstanceId ||
    plan.action !== request.action ||
    plan.expectedRevision !== request.expectedRevision ||
    plan.planHash !== request.expectedPlanHash ||
    plan.status !== 'ready' ||
    plan.executable !== true ||
    plan.profile !== undefined ||
    plan.diagnostics.length !== 0 ||
    plan.nodes.length !== 1 ||
    plan.order.length !== 1 ||
    !fresh(plan.observedAt, now) ||
    !fresh(request.acceptedObservedAt, now) ||
    !Number.isFinite(Date.parse(plan.expiresAt)) ||
    Date.parse(plan.expiresAt) <= now ||
    Date.parse(plan.expiresAt) - Date.parse(plan.observedAt) > TTL_MS ||
    (accepted && request.acceptedObservedAt !== plan.observedAt) ||
    !node ||
    node.serviceRef !== plan.order[0] ||
    !isSystemdUserUnit(node.serviceRef) ||
    node.provider !== 'systemd' ||
    node.relation !== 'required' ||
    node.consumerCount !== 1 ||
    node.dependencies.length !== 0 ||
    node.readiness !== 'unknown' ||
    node.state !== (request.action === 'start' ? 'stopped' : 'running') ||
    node.disposition !== (request.action === 'start' ? 'willStart' : 'willStop') ||
    node.systemdCapability?.status !== 'supported'
  ) deny();
  return node;
}

/**
 * Unregistered single-unit systemd confirmation coordinator.
 * The production planner always returns executable:false and never supported.
 * There is no HTTP route or executable app composition for this class.
 *
 * The environment lock belongs here. The delegated owner independently takes
 * both resource:<ref> and the physical systemd:user:<unit> locks.
 */
export class SystemdConfirmedLifecycleCoordinator {
  private readonly now: () => Date;

  public constructor(
    private readonly d: Dependencies,
    options: { now?: () => Date } = {},
  ) {
    this.now = options.now ?? (() => new Date());
  }

  public async run(request: ConfirmedLifecycleRequest): Promise<ConfirmedLifecycleResult> {
    if (
      !request.projectId ||
      !request.environmentInstanceId ||
      (request.action !== 'start' && request.action !== 'stop') ||
      !HASH.test(request.expectedRevision) ||
      !HASH.test(request.expectedPlanHash) ||
      !fresh(request.acceptedObservedAt, this.now().getTime())
    ) deny();

    const initial = await this.preview(request, request.expectedPlanHash);
    const node = approved(initial, request, this.now().getTime(), true);
    const environmentKey =
      'environment:' + request.projectId + ':' + request.environmentInstanceId;

    return this.d.locks.withResources([environmentKey], async (lease) => {
      await lease.assertOwned();
      const locked = await this.preview(request, request.expectedPlanHash);
      const lockedNode = approved(locked, request, this.now().getTime(), false);
      if (
        JSON.stringify(lockedNode) !== JSON.stringify(node) ||
        locked.observedAt !== initial.observedAt
      ) deny();
      await lease.assertOwned();

      // Durable intent and in-flight marker MUST precede owner dispatch.
      // If either write fails, no provider command may be attempted.
      const id = this.d.jobs.begin(request, [node.serviceRef]);
      this.d.jobs.beforeStep(id, node.serviceRef);
      await lease.assertOwned();

      let state: ConfirmedLifecycleStep['state'] = 'failed';
      try {
        // The owner must independently re-check the live grant and plan under
        // both unit leases. Its runner cannot claim application readiness.
        await this.d.runner.run(request.action, node, request);
        state = 'unverified';
        const after = await this.preview(request);
        const matching = after.nodes.filter(
          (item) => item.serviceRef === node.serviceRef,
        );
        if (
          after.target.projectId === request.projectId &&
          after.target.environmentInstanceId === request.environmentInstanceId &&
          after.nodes.length === 1 &&
          matching.length === 1 &&
          fresh(after.observedAt, this.now().getTime()) &&
          matching[0]?.provider === 'systemd' &&
          matching[0].relation === 'required' &&
          matching[0].consumerCount === 1 &&
          matching[0].readiness === 'unknown' &&
          matching[0].state ===
            (request.action === 'start' ? 'running' : 'stopped')
        ) state = 'completed';
      } catch {
        // The unit might have changed before an error. Never replay.
        // Raw command/DBus/grant messages are not exposed or persisted.
      }

      const step: ConfirmedLifecycleStep = {
        serviceRef: node.serviceRef,
        action: request.action,
        dispositionBefore: node.disposition,
        state,
        ...(state === 'completed'
          ? {}
          : { diagnostic: 'Lifecycle outcome requires manual reconciliation.' }),
      };
      // Write the result into the durable Job BEFORE writing Activity.
      // A failed journal update leaves an orphaned invoking record, not retry.
      this.d.jobs.step(id, step);
      try {
        await this.d.events.append(step, request);
      } catch {
        // Activity outages must not cause duplicate provider invocation.
        // The durable Job remains the authoritative recovery record.
      }
      const result: ConfirmedLifecycleResult = {
        projectId: request.projectId,
        environmentInstanceId: request.environmentInstanceId,
        action: request.action,
        status: state === 'completed' ? 'completed' : 'partial',
        steps: [step],
        ...(state === 'completed'
          ? {}
          : { diagnostic: 'Systemd operation needs independent recovery review.' }),
      };
      this.d.jobs.finish(id, result);
      return result;
    });
  }

  private preview(
    request: ConfirmedLifecycleRequest,
    expectedPlanHash?: string,
  ): Promise<FuturePlan> {
    return this.d.planner.preview(
      request.projectId,
      request.action,
      request.environmentInstanceId,
      expectedPlanHash,
    );
  }
}
