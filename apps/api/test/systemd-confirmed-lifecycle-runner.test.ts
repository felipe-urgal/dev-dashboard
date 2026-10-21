import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  ConfirmedLifecycleRequest,
  ServiceLifecyclePlanNode,
} from '@dev-dashboard/contracts';

import { SystemdConfirmedLifecycleRunner } from '../src/services/systemd-confirmed-lifecycle-runner.js';

const NOW = new Date('2026-10-21T13:00:00.000Z');
const REF = 'systemd:user:fixture-worker.service';
const REV = 'a'.repeat(64);
const HASH = 'b'.repeat(64);

const request: ConfirmedLifecycleRequest = {
  projectId: 'demo',
  environmentInstanceId: 'environment:primary:demo',
  action: 'start',
  acceptedObservedAt: NOW.toISOString(),
  expectedRevision: REV,
  expectedPlanHash: HASH,
};

function node(
  overrides: Partial<ServiceLifecyclePlanNode> = {},
): ServiceLifecyclePlanNode {
  return {
    serviceRef: REF,
    name: 'fixture-worker.service',
    provider: 'systemd',
    disposition: 'willStart',
    state: 'stopped',
    readiness: 'unknown',
    relation: 'required',
    ports: [],
    dependencies: [],
    consumerCount: 1,
    systemdCapability: {
      status: 'supported',
      reason: 'Future only: never emitted by production planner.',
    },
    ...overrides,
  };
}

function fixture(
  result?: {
    serviceRef: string;
    action: 'start' | 'stop' | 'restart';
    outcome: 'changed' | 'already-in-target-state';
    state: 'running' | 'stopped';
    readiness: 'unknown';
  },
) {
  const calls: unknown[] = [];
  const owner = {
    run: async (input: unknown) => {
      calls.push(input);
      return result ?? {
        serviceRef: REF,
        action: 'start' as const,
        outcome: 'changed' as const,
        state: 'running' as const,
        readiness: 'unknown' as const,
      };
    },
  };
  const runner = new SystemdConfirmedLifecycleRunner(owner, { now: () => NOW });
  return { runner, calls };
}

test('internal Start bridge passes canonical identity/hash to owner and never claims readiness', async () => {
  const f = fixture();
  await f.runner.run('start', node(), request);
  assert.deepEqual(f.calls, [{
    projectId: 'demo',
    environmentInstanceId: 'environment:primary:demo',
    serviceRef: REF,
    action: 'start',
    expectedRevision: REV,
    planHash: HASH,
  }]);
});

test('internal Stop bridge uses the correct expected transition', async () => {
  const f = fixture({
    serviceRef: REF,
    action: 'stop',
    outcome: 'changed',
    state: 'stopped',
    readiness: 'unknown',
  });
  await f.runner.run(
    'stop',
    node({ state: 'running', disposition: 'willStop' }),
    { ...request, action: 'stop' },
  );
  assert.equal(f.calls.length, 1);
});

test('system scope, Dashboard, unknown and other nodes never enter owner', async () => {
  const denied = [
    node({ serviceRef: 'systemd:system:postgresql.service' }),
    node({ serviceRef: 'systemd:user:dev-dashboard.service' }),
    node({ serviceRef: 'systemd:user:worker@.service' }),
    node({ serviceRef: 'systemd:user:../../evil.service' }),
    node({ serviceRef: 'systemd:user:--evil.service' }),
    node({ serviceRef: 'compose:demo:api', provider: 'compose' }),
    node({ relation: 'observed' }),
    node({ relation: 'owned' }),
    node({ consumerCount: 2 }),
    node({ readiness: 'ready' }),
    node({ state: 'running' }),
    node({ disposition: 'alreadyReady' }),
    (() => { const absent = node(); delete absent.systemdCapability; return absent; })(),
    node({ systemdCapability: { status: 'permission-required', reason: 'missing grant' } }),
    node({ systemdCapability: { status: 'unknown', reason: 'incomplete' } }),
    node({ systemdCapability: { status: 'unsupported', reason: 'scope policy' } }),
  ];
  for (const candidate of denied) {
    const f = fixture();
    await assert.rejects(f.runner.run('start', candidate, request));
    assert.equal(f.calls.length, 0);
  }
});

test('stale/foreign/malformed confirmations cannot delegate', async () => {
  const denied: Array<{
    req: ConfirmedLifecycleRequest;
    action: 'start' | 'stop';
  }> = [
    { req: { ...request, acceptedObservedAt: new Date(NOW.getTime()-30_001).toISOString() }, action: 'start' },
    { req: { ...request, acceptedObservedAt: new Date(NOW.getTime()+1).toISOString() }, action: 'start' },
    { req: { ...request, acceptedObservedAt: 'invalid' }, action: 'start' },
    { req: { ...request, expectedPlanHash: '' }, action: 'start' },
    { req: { ...request, expectedRevision: 'c' }, action: 'start' },
    { req: { ...request, projectId: '' }, action: 'start' },
    { req: { ...request, environmentInstanceId: '' }, action: 'start' },
    { req: request, action: 'stop' },
  ];
  for (const {req,action} of denied) {
    const f = fixture();
    await assert.rejects(f.runner.run(action, node(), req));
    assert.equal(f.calls.length, 0);
  }
});

test('no-op and post-dispatch mismatches fail closed and require reconciliation', async () => {
  for (const outcome of [
    { serviceRef: REF, action: 'start' as const, outcome: 'already-in-target-state' as const, state: 'running' as const, readiness: 'unknown' as const },
    { serviceRef: 'systemd:user:different.service', action: 'start' as const, outcome: 'changed' as const, state: 'running' as const, readiness: 'unknown' as const },
    { serviceRef: REF, action: 'start' as const, outcome: 'changed' as const, state: 'stopped' as const, readiness: 'unknown' as const },
    { serviceRef: REF, action: 'stop' as const, outcome: 'changed' as const, state: 'running' as const, readiness: 'unknown' as const },
  ]) {
    const f = fixture(outcome);
    await assert.rejects(f.runner.run('start', node(), request), /reconciliation/);
    assert.equal(f.calls.length, 1);
  }
});

test('owner errors propagate to coordinator for sanitized partial result', async () => {
  const runner = new SystemdConfirmedLifecycleRunner({
    run: async () => { throw new Error('private path /home/user/token'); },
  }, { now: () => NOW });
  await assert.rejects(runner.run('start', node(), request), /private path/);
});
