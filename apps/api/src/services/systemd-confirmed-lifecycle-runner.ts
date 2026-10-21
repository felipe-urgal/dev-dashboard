import type {
  ConfirmedLifecycleRequest,
  ServiceLifecycleAction,
  ServiceLifecyclePlanNode,
} from '@dev-dashboard/contracts';

import { ApiError } from '../http/api-error.js';
import type { ConfirmedLifecycleRunner } from './confirmed-service-lifecycle-coordinator.js';
import type { SystemdUserLifecycleService } from './systemd-user-lifecycle-service.js';

const HASH = /^[a-f0-9]{64}$/;
const UNIT = /^systemd:user:[A-Za-z0-9][A-Za-z0-9_.@:-]{0,190}\.service$/;
const ACCEPTANCE_TTL_MS = 30_000;

function deny(message: string): never {
  throw new ApiError({ statusCode: 409, code: 'CONFLICT', message });
}

/**
 * Internal, owner-aware bridge from the confirmed coordinator to the user-unit
 * adapter. NEVER register this directly as an HTTP route. The current
 * coordinator still rejects systemd nodes and the current planner never
 * emits systemdCapability=supported or executable=true.
 *
 * The adapter independently rereads the live grant, plan and unit while
 * holding its canonical systemd:user lock before dispatch.
 */
export class SystemdConfirmedLifecycleRunner implements ConfirmedLifecycleRunner {
  private readonly now: () => Date;

  public constructor(
    private readonly owner: Pick<SystemdUserLifecycleService, 'run'>,
    options: { now?: () => Date } = {},
  ) {
    this.now = options.now ?? (() => new Date());
  }

  public async run(
    action: ServiceLifecycleAction,
    node: Readonly<ServiceLifecyclePlanNode>,
    request: Readonly<ConfirmedLifecycleRequest>,
  ): Promise<void> {
    if (
      action !== request.action ||
      (action !== 'start' && action !== 'stop') ||
      !request.projectId ||
      !request.environmentInstanceId ||
      !HASH.test(request.expectedRevision) ||
      !HASH.test(request.expectedPlanHash)
    ) {
      deny('Systemd lifecycle confirmation is invalid.');
    }
    const age = this.now().getTime() - Date.parse(request.acceptedObservedAt);
    if (!Number.isFinite(age) || age < 0 || age > ACCEPTANCE_TTL_MS) {
      deny('Systemd lifecycle confirmation expired.');
    }
    if (
      node.provider !== 'systemd' ||
      node.relation !== 'required' ||
      node.consumerCount !== 1 ||
      node.readiness !== 'unknown' ||
      node.disposition !== (action === 'start' ? 'willStart' : 'willStop') ||
      node.state !== (action === 'start' ? 'stopped' : 'running') ||
      node.systemdCapability?.status !== 'supported'
    ) {
      deny('Systemd unit is not approved for this lifecycle step.');
    }
    const ref = node.serviceRef;
    if (
      !UNIT.test(ref) ||
      ref.includes('..') ||
      ref.includes('@.service') ||
      /^systemd:user:dev-dashboard(?:[.@-]|\.service)/i.test(ref)
    ) {
      deny('Systemd unit identity is not eligible for lifecycle.');
    }

    // Canonical ref and server-derived project/environment are carried through
    // unchanged. The owner refuses stale revisions/planHash, revoked grants,
    // invalid leases and ambiguous runtime observations.
    const result = await this.owner.run({
      projectId: request.projectId,
      environmentInstanceId: request.environmentInstanceId,
      serviceRef: ref,
      action,
      expectedRevision: request.expectedRevision,
      planHash: request.expectedPlanHash,
    });
    // An outside actor may have changed state between preview and dispatch.
    // Never mistake a no-op for verified completion of the approved step.
    if (
      result.serviceRef !== ref ||
      result.action !== action ||
      result.outcome !== 'changed' ||
      result.state !== (action === 'start' ? 'running' : 'stopped') ||
      result.readiness !== 'unknown'
    ) {
      deny('Systemd transition is not verified; reconciliation is required.');
    }
    // No readiness is claimed; coordinator still requires independent post-step
    // observation. Start cannot be declared ready solely from an active unit.
  }
}
