import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type {
  ConfirmedLifecycleRequest,
  ServiceLifecycleAction,
  ServiceLifecyclePlan,
  ServiceLifecyclePlanNode,
} from '@dev-dashboard/contracts';

import { ConfirmedServiceLifecycleCoordinator, confirmedLifecycleResourceKeys } from '../src/services/confirmed-service-lifecycle-coordinator.js';
import { ServiceResourceOperationLock } from '../src/services/service-resource-operation-lock.js';
import { ConfirmedLifecycleJobJournal } from '../src/services/confirmed-lifecycle-job-journal.js';

const NOW = new Date('2026-10-20T12:00:00.000Z');
const REVISION = 'a'.repeat(64);
const HASH = 'b'.repeat(64);
const DB = 'compose:loto:database';
const API = 'compose:loto:api';

function request(
  action: ServiceLifecycleAction = 'start',
): ConfirmedLifecycleRequest {
  return {
    projectId: 'loto',
    environmentInstanceId: 'environment:primary:loto',
    action,
    expectedRevision: REVISION,
    expectedPlanHash: HASH,
    acceptedObservedAt: NOW.toISOString(),
  };
}

function fixture(
  options: {
    action?: ServiceLifecycleAction;
    refs?: string[];
    shared?: boolean;
    wrongOwnership?: boolean;
    blocked?: boolean;
    provider?: 'compose' | 'systemd';
  } = {},
) {
  const action = options.action ?? 'start';
  const refs = options.refs ?? [DB, API];
  const states = new Map(
    refs.map((ref) => [ref, action === 'start' ? 'stopped' : 'running']),
  );
  const readiness = new Map(
    refs.map((ref) => [ref, action === 'start' ? 'unknown' : 'ready']),
  );
  let fingerprint = HASH;
  let revision = REVISION;
  let failInspection = false;
  const steps: string[] = [];
  const events: string[] = [];

  function plan(): ServiceLifecyclePlan {
    const order = action === 'start' ? refs : [...refs].reverse();
    const nodes: ServiceLifecyclePlanNode[] = order.map((ref) => {
      const state = states.get(ref) ?? 'unknown';
      const ready = readiness.get(ref) ?? 'unknown';
      const disposition =
        action === 'start'
          ? state === 'running' && ready === 'ready'
            ? 'alreadyReady'
            : 'willStart'
          : state === 'stopped'
            ? 'retained'
            : 'willStop';
      return {
        serviceRef: ref,
        name: ref,
        provider: options.provider ?? 'compose',
        state,
        readiness: ready as 'ready' | 'unknown',
        relation:
          options.provider === 'systemd' || options.wrongOwnership
            ? 'required'
            : 'owned',
        ports: [],
        consumerCount: options.shared ? 2 : 1,
        dependencies: ref === API && refs.includes(DB) ? [DB] : [],
        disposition: options.blocked ? 'blocked' : disposition,
      };
    });
    return {
      target: {
        kind: 'project-environment',
        projectId: 'loto',
        environmentInstanceId: 'environment:primary:loto',
      },
      action,
      status: options.blocked ? 'blocked' : 'ready',
      expectedRevision: revision,
      planHash: fingerprint,
      observedAt: NOW.toISOString(),
      expiresAt: new Date(NOW.getTime() + 30_000).toISOString(),
      order,
      nodes,
      diagnostics: [],
      executable: false,
    };
  }

  const runner = {
    async run(
      operation: ServiceLifecycleAction,
      node: ServiceLifecyclePlanNode,
    ) {
      steps.push(node.serviceRef);
      states.set(
        node.serviceRef,
        operation === 'start' ? 'running' : 'stopped',
      );
      readiness.set(
        node.serviceRef,
        operation === 'start' ? 'ready' : 'unknown',
      );
    },
  };
  const planner = {
    async preview(
      _projectId: string,
      _action: ServiceLifecycleAction,
      _environmentInstanceId?: string,
      expectedHash?: string,
    ) {
      if (failInspection) throw new Error('provider unavailable: secret');
      const snapshot = plan();
      if (expectedHash && expectedHash !== snapshot.planHash) {
        throw new Error('Lifecycle plan changed');
      }
      return snapshot;
    },
  };
  const coordinator = new ConfirmedServiceLifecycleCoordinator(
    {
      planner,
      runner,
      locks: new ServiceResourceOperationLock(),
      events: {
        append: async (step) => {
          events.push(step.serviceRef + ':' + step.state);
          throw new Error('event repository offline');
        },
      },
    },
    { now: () => NOW },
  );
  return {
    coordinator,
    planner,
    runner,
    states,
    readiness,
    steps,
    events,
    setFingerprint: (v: string) => {
      fingerprint = v;
    },
    setRevision: (v: string) => {
      revision = v;
    },
    failObservation: () => {
      failInspection = true;
    },
    plan,
  };
}

test('confirmed start runs in dependency order and verifies each node independently', async () => {
  const f = fixture();
  const result = await f.coordinator.run(request());
  assert.equal(result.status, 'completed');
  assert.deepEqual(f.steps, [DB, API]);
  assert.deepEqual(
    result.steps.map((step) => step.state),
    ['completed', 'completed'],
  );
  assert.equal(f.events.length, 2); // Activity failures do not provoke retries.
});

test('confirmed stop runs in reverse order without attempting automatic rollback', async () => {
  const f = fixture({ action: 'stop' });
  const result = await f.coordinator.run(request('stop'));
  assert.equal(result.status, 'completed');
  assert.deepEqual(f.steps, [API, DB]);
  assert.equal(f.states.get(API), 'stopped');
});

test('rejects old confirmation, stale hash, changed revision and blocked plans', async () => {
  const f = fixture();
  await assert.rejects(
    f.coordinator.run({
      ...request(),
      acceptedObservedAt: new Date(NOW.getTime() - 30_001).toISOString(),
    }),
    /preview expired/,
  );
  await assert.rejects(
    f.coordinator.run({
      ...request(),
      acceptedObservedAt: new Date(NOW.getTime() + 1).toISOString(),
    }),
    /preview expired/,
  );
  f.setFingerprint('c'.repeat(64));
  await assert.rejects(f.coordinator.run(request()), /plan changed/i);
  f.setFingerprint(HASH);
  f.setRevision('d'.repeat(64));
  await assert.rejects(f.coordinator.run(request()), /no longer matches/);
  assert.equal(f.steps.length, 0);

  const blocked = fixture({ blocked: true });
  await assert.rejects(
    blocked.coordinator.run(request()),
    /blocked or no longer matches/,
  );
});

test('shared or unowned Compose resources never reach runner', async () => {
  const shared = fixture({ shared: true });
  await assert.rejects(shared.coordinator.run(request()), /exclusively owned/);
  assert.equal(shared.steps.length, 0);
  const unowned = fixture({ wrongOwnership: true });
  await assert.rejects(unowned.coordinator.run(request()), /exclusively owned/);
  assert.equal(unowned.steps.length, 0);
});

test('failure after one completed mutation is reported partial without rollback', async () => {
  const f = fixture();
  const original = f.runner.run;
  f.runner.run = async (action, node) => {
    if (node.serviceRef === API) throw new Error('password-in-error');
    return original(action, node);
  };
  const result = await f.coordinator.run(request());
  assert.equal(result.status, 'partial');
  assert.deepEqual(
    result.steps.map((step) => step.state),
    ['completed', 'failed'],
  );
  assert.equal(f.states.get(DB), 'running');
  assert.equal(f.states.get(API), 'stopped');
  assert.doesNotMatch(JSON.stringify(result), /password-in-error/);
});

test('a mutation that cannot prove final state is reported partial and not retried', async () => {
  const f = fixture({ refs: [DB] });
  f.runner.run = async (_action, node) => {
    f.steps.push(node.serviceRef);
  };
  const result = await f.coordinator.run(request());
  assert.equal(result.status, 'partial');
  assert.equal(result.steps[0]?.state, 'unverified');
  assert.deepEqual(f.steps, [DB]);
});

test('revalidation stops before next mutation when ownership or observations drift', async () => {
  const f = fixture();
  const original = f.runner.run;
  f.runner.run = async (action, node) => {
    await original(action, node);
    if (node.serviceRef === DB) f.setRevision('e'.repeat(64));
  };
  const result = await f.coordinator.run(request());
  assert.equal(result.status, 'partial');
  assert.deepEqual(f.steps, [DB]);
  assert.equal(result.steps[0]?.state, 'completed');

  const unavailable = fixture();
  unavailable.runner.run = async (action, node) => {
    await fixtureRunnerRun(action, node);
    unavailable.failObservation();
  };
  async function fixtureRunnerRun(
    _action: ServiceLifecycleAction,
    node: ServiceLifecyclePlanNode,
  ) {
    unavailable.steps.push(node.serviceRef);
  }
  const missing = await unavailable.coordinator.run(request());
  assert.equal(missing.status, 'partial');
  assert.equal(missing.steps[0]?.state, 'unverified');
});

test('simultaneous requests for same resource cannot execute inside the lock', async () => {
  const f = fixture({ refs: [DB] });
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started!: () => void;
  const entered = new Promise<void>((resolve) => {
    started = resolve;
  });
  const original = f.runner.run;
  f.runner.run = async (action, node) => {
    started();
    await held;
    await original(action, node);
  };
  const first = f.coordinator.run(request());
  await entered;
  await assert.rejects(
    f.coordinator.run(request()),
    /already using one of these resources/,
  );
  release();
  assert.equal((await first).status, 'completed');
});

test('the coordinator never double-acquires the Compose owner lock', async () => {
  const f = fixture({ refs: [DB] });
  const shared = new ServiceResourceOperationLock();
  const coordinator = new ConfirmedServiceLifecycleCoordinator(
    {
      planner: f.planner,
      locks: shared,
      runner: {
        run: (action, node) =>
          shared.withResources(['compose-project:loto'], () =>
            f.runner.run(action, node),
          ),
      },
    },
    { now: () => NOW },
  );
  const result = await coordinator.run(request());
  assert.equal(result.status, 'completed');
  assert.deepEqual(f.steps, [DB]);
});

test('coordinator persists completed steps and completed job without exposing raw errors', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'coordinator-jobs-'));
  try {
    const f = fixture({ refs: [DB] });
    const jobs = new ConfirmedLifecycleJobJournal(directory, {
      now: () => NOW,
    });
    const coordinator = new ConfirmedServiceLifecycleCoordinator(
      {
        planner: f.planner,
        runner: f.runner,
        locks: new ServiceResourceOperationLock(),
        jobs,
      },
      { now: () => NOW },
    );

    const result = await coordinator.run(request());
    assert.equal(result.status, 'completed');
    assert.deepEqual(f.steps, [DB]);

    const reopened = new ConfirmedLifecycleJobJournal(directory, {
      now: () => NOW,
    });
    const records = reopened.list('loto');
    assert.equal(records.length, 1);
    assert.equal(records[0]?.stage, 'finished');
    assert.equal(records[0]?.status, 'completed');
    assert.deepEqual(
      records[0]?.steps.map((s) => s.serviceRef),
      [DB],
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('failure to persist confirmed intent aborts BEFORE the owner is called', async () => {
  const f = fixture({ refs: [DB] });
  const coordinator = new ConfirmedServiceLifecycleCoordinator(
    {
      planner: f.planner,
      runner: f.runner,
      locks: new ServiceResourceOperationLock(),
      jobs: {
        begin: () => {
          throw new Error('Journal could not persist intent');
        },
        beforeStep: () => undefined,
        step: () => undefined,
        finish: () => undefined,
      },
    },
    { now: () => NOW },
  );
  await assert.rejects(coordinator.run(request()), /could not persist intent/);
  assert.deepEqual(f.steps, []);
});

test('uncertain journal write after mutation is never retried and stays in-flight', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'coordinator-jobs-'));
  try {
    const f = fixture({ refs: [DB] });
    const journal = new ConfirmedLifecycleJobJournal(directory, {
      now: () => NOW,
    });
    const coordinator = new ConfirmedServiceLifecycleCoordinator(
      {
        planner: f.planner,
        runner: f.runner,
        locks: new ServiceResourceOperationLock(),
        jobs: {
          begin: (...args) => journal.begin(...args),
          beforeStep: (...args) => journal.beforeStep(...args),
          step: () => {
            throw new Error('disk failure after mutation');
          },
          finish: (...args) => journal.finish(...args),
        },
      },
      { now: () => NOW },
    );

    await assert.rejects(
      coordinator.run(request()),
      /disk failure after mutation/,
    );
    assert.deepEqual(f.steps, [DB]);
    const reopened = new ConfirmedLifecycleJobJournal(directory, {
      now: () => NOW,
    });
    assert.equal(reopened.list('loto')[0]?.reconciliationRequired, true);
    assert.equal(reopened.list('loto')[0]?.inFlightRef, DB);
    assert.throws(
      () => reopened.begin(request(), [DB]),
      /journal is unavailable/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('coordinator does not dispatch systemd steps even when an injected runner exists', async () => {
  const f = fixture({
    provider: 'systemd',
    refs: ['systemd:user:fixture-worker.service'],
  });
  await assert.rejects(
    f.coordinator.run(request()),
    /supported, exclusively owned lifecycle adapter/,
  );
  assert.deepEqual(f.steps, []);
  assert.deepEqual(f.events, []);
});

test('future systemd owner receives both locks; coordinator retains only environment', async () => {
  const ref = 'systemd:user:fixture-worker.service';
  const sys = fixture({ refs: [ref], provider: 'systemd' });
  assert.deepEqual(confirmedLifecycleResourceKeys(sys.plan()), [
    'environment:loto:environment:primary:loto',
  ]);
  await assert.rejects(sys.coordinator.run(request()), /exclusively owned lifecycle adapter/);
  assert.deepEqual(sys.steps, []);

  const compose = fixture({ refs: [API] });
  assert.deepEqual(confirmedLifecycleResourceKeys(compose.plan()), [
    'environment:loto:environment:primary:loto', 'resource:' + API,
  ]);
  const systemScope = fixture({
    refs: ['systemd:system:fixture-worker.service'], provider: 'systemd',
  });
  assert.deepEqual(confirmedLifecycleResourceKeys(systemScope.plan()), [
    'environment:loto:environment:primary:loto',
    'resource:systemd:system:fixture-worker.service',
  ]);
});
