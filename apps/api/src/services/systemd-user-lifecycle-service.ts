import { execFile } from 'node:child_process';

import type {
  HostServiceInventory,
  HostServiceObservation,
} from '@dev-dashboard/contracts';

import { ApiError } from '../http/api-error.js';
import type { ServiceResourceOperationLock } from './service-resource-operation-lock.js';
import type { SystemdServiceInventory } from './systemd-service-inventory.js';

const UNIT_NAME = /^[A-Za-z0-9][A-Za-z0-9_.@:-]{0,190}\.service$/;
const TIMEOUT_MS = 10_000;
const MAX_OUTPUT_BYTES = 16 * 1024;

export type SystemdUserLifecycleAction = 'start' | 'stop' | 'restart';

/** Only trusted server-side orchestration may build this request. */
export interface SystemdUserLifecycleRequest {
  projectId: string;
  environmentInstanceId: string;
  serviceRef: string;
  action: SystemdUserLifecycleAction;
  expectedRevision: string;
  planHash: string;
}

export type SystemdUserLifecycleAuthorization = (
  request: Readonly<SystemdUserLifecycleRequest>,
) => Promise<boolean>;

type Runner = (
  action: SystemdUserLifecycleAction,
  unit: string,
) => Promise<void>;

interface Dependencies {
  inventory: Pick<SystemdServiceInventory, 'inspect'>;
  locks: Pick<ServiceResourceOperationLock, 'withResources'>;
  /** Verify explicit server-side grant and revision/plan, not discovery/bindings. */
  authorize: SystemdUserLifecycleAuthorization;
}

export interface SystemdUserLifecycleOptions {
  platform?: NodeJS.Platform;
  runSystemctl?: Runner;
}

function conflict(message: string): never {
  throw new ApiError({ statusCode: 409, code: 'CONFLICT', message });
}

function forbidden(message: string): never {
  throw new ApiError({ statusCode: 403, code: 'FORBIDDEN', message });
}

/** Does not spawn a shell, elevate privileges or allow caller-supplied argv. */
function runSystemctl(
  action: SystemdUserLifecycleAction,
  unit: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(
      'systemctl',
      ['--user', action, '--', unit],
      {
        encoding: 'utf8',
        timeout: TIMEOUT_MS,
        maxBuffer: MAX_OUTPUT_BYTES,
        windowsHide: true,
        env: { ...process.env, LC_ALL: 'C' },
      },
      (error) => (error ? reject(error) : resolve()),
    );
  });
}

function unitName(serviceRef: string): string {
  if (!serviceRef.startsWith('systemd:user:'))
    forbidden('Only explicitly authorized user units are supported.');
  const unit = serviceRef.slice('systemd:user:'.length);
  if (
    !UNIT_NAME.test(unit) ||
    unit.includes('..') ||
    unit.includes('@.service') ||
    /^dev-dashboard(?:[.@-]|\.service)/i.test(unit)
  ) {
    forbidden('Unit identity is not supported for lifecycle mutation.');
  }
  return unit;
}

function observedUnit(
  snapshot: HostServiceInventory,
  unit: string,
): HostServiceObservation {
  const source = snapshot.sources.find((item) => item.scope === 'user');
  const matching = snapshot.services.filter(
    (item) =>
      item.id === 'systemd:user:' + unit &&
      item.scope === 'user' &&
      item.name === unit,
  );
  if (
    source?.status !== 'ready' ||
    snapshot.truncated ||
    matching.length !== 1
  ) {
    conflict(
      'Systemd unit identity or observation is incomplete. Refresh before retrying.',
    );
  }
  const observation = matching[0]!;
  if (
    observation.provider !== 'systemd' ||
    observation.fragmentKind !== 'persistent' ||
    (observation.unitKind !== 'regular' &&
      observation.unitKind !== 'instance') ||
    observation.bootState === 'masked' ||
    observation.bootState === 'generated' ||
    observation.bootState === 'transient' ||
    observation.bootState === 'unknown' ||
    observation.state === 'unknown' ||
    observation.state === 'starting' ||
    observation.state === 'stopping' ||
    !['running', 'stopped'].includes(observation.state)
  ) {
    conflict('Unit is not a verified, persistent, controllable user service.');
  }
  // A "running" unit must also have verified systemctl ActiveState/SubState.
  if (
    (observation.state === 'running' &&
      (observation.activeState !== 'active' ||
        observation.subState !== 'running')) ||
    (observation.state === 'stopped' && observation.activeState !== 'inactive')
  ) {
    conflict('Unit runtime state cannot be verified.');
  }
  return observation;
}

/**
 * Internal building block for #1117. Not wired to HTTP or the service planner:
 * callers must first implement an explicit server-side grant and revision-safe
 * plan authorization. Bindings and inventory alone are never enough.
 */
export class SystemdUserLifecycleService {
  private readonly platform: NodeJS.Platform;
  private readonly runner: Runner;

  public constructor(
    private readonly d: Dependencies,
    options: SystemdUserLifecycleOptions = {},
  ) {
    this.platform = options.platform ?? process.platform;
    this.runner = options.runSystemctl ?? runSystemctl;
  }

  public async run(request: SystemdUserLifecycleRequest): Promise<{
    serviceRef: string;
    action: SystemdUserLifecycleAction;
    outcome: 'changed' | 'already-in-target-state';
    state: 'running' | 'stopped';
    readiness: 'unknown';
  }> {
    if (this.platform !== 'linux')
      forbidden('Systemd mutations are supported on Linux only.');
    if (!['start', 'stop', 'restart'].includes(request.action))
      forbidden('Unsupported systemd lifecycle action.');
    if (
      !request.projectId ||
      !request.environmentInstanceId ||
      !/^[a-f0-9]{64}$/.test(request.expectedRevision) ||
      !/^[a-f0-9]{64}$/.test(request.planHash)
    ) {
      forbidden('A server-verified lifecycle plan is required.');
    }
    const unit = unitName(request.serviceRef);
    // No inventory result, catalog entry or ownership claim grants permission.
    if (!(await this.d.authorize(request)))
      forbidden('Unit is not explicitly authorized for this lifecycle plan.');

    return this.d.locks.withResources(['systemd:user:' + unit], async (lease) => {
      await lease.assertOwned();
      const before = observedUnit(await this.d.inventory.inspect(), unit);
      const target = request.action === 'stop' ? 'stopped' : 'running';
      if (request.action === 'restart' && before.state !== 'running') {
        conflict('Restart requires a verified running user unit.');
      }
      // No command if the unit is already in the target state.
      if (request.action !== 'restart' && before.state === target) {
        if (!(await this.d.authorize(request)))
          forbidden('Unit authorization changed. Refresh the plan.');
        return {
          serviceRef: request.serviceRef,
          action: request.action,
          outcome: 'already-in-target-state' as const,
          state: target,
          readiness: 'unknown' as const,
        };
      }

      const current = observedUnit(await this.d.inventory.inspect(), unit);
      if (
        current.state !== before.state ||
        current.bootState !== before.bootState ||
        current.unitKind !== before.unitKind ||
        current.fragmentKind !== before.fragmentKind
      ) {
        conflict('Unit state changed since preflight. Refresh the plan.');
      }
      if (!(await this.d.authorize(request)))
        forbidden('Unit authorization changed. Refresh the plan.');
      await lease.assertOwned();
      try {
        await this.runner(request.action, unit);
      } catch {
        // Never return systemctl output: it may contain paths or secrets.
        conflict(
          'Systemd user lifecycle command failed or timed out; reobserve before retrying.',
        );
      }
      // Command exit status alone does not prove the transition.
      const after = observedUnit(await this.d.inventory.inspect(), unit);
      if (
        after.state !== target ||
        after.bootState !== before.bootState ||
        after.unitKind !== before.unitKind ||
        after.fragmentKind !== before.fragmentKind
      )
        conflict(
          'Systemd unit transition is unverified; reconcile before retrying.',
        );
      return {
        serviceRef: request.serviceRef,
        action: request.action,
        outcome: 'changed' as const,
        state: target,
        readiness: 'unknown' as const,
      };
    });
  }
}
