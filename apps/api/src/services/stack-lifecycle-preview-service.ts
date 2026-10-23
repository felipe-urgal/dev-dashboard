import { createHash } from 'node:crypto';

import type {
  StackCheck,
  StackLifecyclePreview,
  StackNodeTarget,
  StackResource,
} from '@dev-dashboard/contracts';

import { ApiError } from '../http/api-error.js';
import { stackRevision } from './stack-revision.js';
import type { StackCheckService } from './stack-check-service.js';
import type { StackDefinitionService } from './stack-definition-service.js';
import type { StackResourceCatalogService } from './stack-resource-catalog-service.js';

const PLAN_TTL_MS = 30_000;

/** Opaque target identity assembled only from backend-resolved Stack records. */
function targetKey(target: StackNodeTarget): string {
  switch (target.kind) {
    case 'environment':
      return JSON.stringify([
        target.kind,
        target.projectId,
        target.environmentInstanceId,
      ]);
    case 'process':
      return JSON.stringify([
        target.kind,
        target.projectId,
        target.environmentInstanceId,
        target.processId,
      ]);
    case 'compose-service':
      return JSON.stringify([
        target.kind,
        target.projectId,
        target.environmentInstanceId,
        target.service,
      ]);
    case 'health-check':
      return JSON.stringify([
        target.kind,
        target.projectId,
        target.environmentInstanceId ?? null,
        target.checkId,
      ]);
  }
}

function conflict(): never {
  throw new ApiError({
    statusCode: 409,
    code: 'CONFLICT',
    message: 'Stack lifecycle preview changed. Refresh before reviewing it again.',
  });
}

/**
 * A Stack-target observation only. Does not reimplement the project service
 * planner, claim external-consumer/port proof, or hold physical leases.
 * No lifecycle runner is injected, and no mutation can be dispatched.
 */
export class StackLifecyclePreviewService {
  private readonly now: () => Date;

  public constructor(
    private readonly dependencies: {
      check: Pick<StackCheckService, 'check'>;
      stacks: Pick<StackDefinitionService, 'list'>;
      resources: Pick<StackResourceCatalogService, 'list'>;
    },
    options: { now?: () => Date } = {},
  ) {
    this.now = options.now ?? (() => new Date());
  }

  public async preview(
    stackId: string,
    action: 'start' | 'stop',
    expectedPlanHash?: string,
    expectedRevision?: string,
  ): Promise<StackLifecyclePreview> {
    const check = await this.dependencies.check.check(stackId);
    const revision = stackRevision(check.stack);
    if (expectedRevision && expectedRevision !== revision) conflict();

    let resources: StackResource[] = [];
    let catalogAvailable = false;
    try {
      resources = await this.dependencies.resources.list();
      catalogAvailable = true;
    } catch {
      // Partial or failed observation cannot authorize any candidate node.
    }
    const knownTargets = new Set(resources.map((entry) => targetKey(entry.target)));
    const otherStacks = this.dependencies.stacks
      .list()
      .filter((candidate) => candidate.id !== stackId);
    const nodesById = new Map(check.stack.nodes.map((node) => [node.id, node]));
    const healthById = new Map(
      check.health.nodes.map((health) => [health.nodeId, health]),
    );
    const dependencies = new Map(
      check.stack.nodes.map((node) => [node.id, [] as string[]]),
    );
    const dependents = new Map(
      check.stack.nodes.map((node) => [node.id, [] as string[]]),
    );
    for (const edge of check.stack.dependencies) {
      dependencies.get(edge.nodeId)!.push(edge.dependsOnNodeId);
      dependents.get(edge.dependsOnNodeId)!.push(edge.nodeId);
    }
    const order =
      action === 'start' ? check.topology.startOrder : check.topology.stopOrder;
    const dispositions = new Map<
      string,
      StackLifecyclePreview['nodes'][number]['disposition']
    >();
    const nodeStates = new Map(
      check.health.nodes.map((node) => [node.nodeId, node.state]),
    );
    const nodes: StackLifecyclePreview['nodes'] = [];

    for (const nodeId of order) {
      const node = nodesById.get(nodeId)!;
      const observed = healthById.get(nodeId);
      const state = observed?.state ?? 'unknown';
      const key = targetKey(node.target);
      const otherStackConsumers = otherStacks.filter((other) =>
        other.nodes.some((candidate) => targetKey(candidate.target) === key),
      ).length;
      const known = catalogAvailable && knownTargets.has(key);
      let disposition: StackLifecyclePreview['nodes'][number]['disposition'] =
        'blocked';
      let diagnostic: string | undefined;

      if (!known) {
        diagnostic = 'Target is not present in the current server resource catalog.';
      } else if (
        state === 'unknown' ||
        state === 'starting' ||
        state === 'blocked' ||
        state === 'failed'
      ) {
        diagnostic = 'Runtime identity or health is not safely verifiable.';
      } else if (action === 'start') {
        if (state === 'ready') {
          // Process Manager running is not independent application readiness.
          if (node.target.kind === 'process') {
            diagnostic = 'Managed process status alone does not prove readiness.';
          } else {
            disposition = 'alreadyReady';
          }
        } else if (node.target.kind === 'compose-service') {
          disposition = 'willStart';
        } else {
          disposition = 'unsupported';
          diagnostic = 'This node has no authorized Stack start adapter.';
        }
      } else if (state === 'stopped') {
        disposition = 'retained';
        diagnostic = 'Resource is already stopped.';
      } else if (
        node.target.kind === 'environment' ||
        node.target.kind === 'health-check'
      ) {
        disposition = 'retained';
        diagnostic = 'Observational node or environment context is not stopped.';
      } else if (otherStackConsumers > 0) {
        disposition = 'retained';
        diagnostic = 'Another Stack references the same physical target.';
      } else {
        // Advisory only: non-Stack consumers/ports still need verification.
        disposition = 'willStop';
      }

      if (
        action === 'start' &&
        disposition !== 'blocked' &&
        dependencies
          .get(nodeId)!
          .some((dependency) => {
            const state = dispositions.get(dependency);
            return state !== 'alreadyReady' && state !== 'willStart';
          })
      ) {
        disposition = 'blocked';
        diagnostic = 'A dependency cannot be safely started or proved ready.';
      }
      if (
        action === 'stop' &&
        disposition === 'willStop' &&
        dependents
          .get(nodeId)!
          .some((dependent) => {
            const dependentState = nodeStates.get(dependent);
            const planned = dispositions.get(dependent);
            return (
              dependentState !== 'stopped' &&
              planned !== 'willStop'
            );
          })
      ) {
        disposition = 'retained';
        diagnostic = 'A dependent Stack node remains active or retained.';
      }
      dispositions.set(nodeId, disposition);
      nodes.push({
        nodeId,
        name: node.name,
        kind: node.target.kind,
        state,
        disposition,
        dependencies: [...dependencies.get(nodeId)!].sort(),
        otherStackConsumers,
        ...(diagnostic ? { diagnostic } : {}),
      });
    }

    const diagnostics = [
      'External service consumers, Port Registry collisions, production policy and physical leases require separate authoritative preflight. This preview cannot authorize execution.',
    ];
    if (!catalogAvailable) {
      diagnostics.push('Server resource discovery is unavailable.');
    }
    if (
      nodes.some(
        (node) =>
          node.disposition === 'blocked' || node.disposition === 'unsupported',
      )
    ) {
      diagnostics.push('One or more Stack nodes cannot be safely planned.');
    }

    const observedAt = this.now().toISOString();
    const planHash = createHash('sha256')
      .update(
        JSON.stringify({
          stackId,
          action,
          revision,
          catalogAvailable,
          order,
          nodes,
        }),
      )
      .digest('hex');
    if (expectedPlanHash && expectedPlanHash !== planHash) conflict();

    return {
      target: { kind: 'stack', stackId },
      action,
      status:
        catalogAvailable &&
        nodes.every(
          (node) =>
            node.disposition !== 'blocked' &&
            node.disposition !== 'unsupported',
        )
          ? 'ready'
          : 'blocked',
      expectedRevision: revision,
      planHash,
      observedAt,
      expiresAt: new Date(
        Date.parse(observedAt) + PLAN_TTL_MS,
      ).toISOString(),
      order: [...order],
      nodes,
      diagnostics,
      executable: false,
    };
  }
}
