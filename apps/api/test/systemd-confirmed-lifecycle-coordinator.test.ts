import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type {
  ConfirmedLifecycleRequest,
  ServiceLifecyclePlan,
} from '@dev-dashboard/contracts';
import type { ActivityEventRepository } from '@dev-dashboard/core';

import { ConfirmedLifecycleJobJournal } from '../src/services/confirmed-lifecycle-job-journal.js';
import { ConfirmedServiceLifecycleActivityWriter } from '../src/services/confirmed-service-lifecycle-activity-writer.js';
import { ServiceResourceOperationLock } from '../src/services/service-resource-operation-lock.js';
import { SystemdConfirmedLifecycleCoordinator } from '../src/services/systemd-confirmed-lifecycle-coordinator.js';
import { SystemdConfirmedLifecycleRunner } from '../src/services/systemd-confirmed-lifecycle-runner.js';

const NOW = new Date('2026-10-21T16:00:00.000Z');
const REF = 'systemd:user:fixture-worker.service';
const HASH = 'a'.repeat(64);
const REV = 'b'.repeat(64);
const PROJECT = 'demo';
const ENV = 'environment:primary:demo';

type FuturePlan = Omit<ServiceLifecyclePlan, 'executable'> & {
  executable: boolean;
};

function confirmation(
  action: 'start' | 'stop' = 'start',
): ConfirmedLifecycleRequest {
  return {
    projectId: PROJECT,
    environmentInstanceId: ENV,
    action,
    expectedPlanHash: HASH,
    expectedRevision: REV,
    acceptedObservedAt: NOW.toISOString(),
  };
}

function setup(action: 'start' | 'stop' = 'start') {
  const root = mkdtempSync(path.join(os.tmpdir(), 'systemd-confirmed-jobs-'));
  const journal = new ConfirmedLifecycleJobJournal(root, { now: () => NOW });
  const locks = new ServiceResourceOperationLock({ stateDirectory: root });
  const events: Array<Parameters<ActivityEventRepository['append']>[0]> = [];
  const calls: string[] = [];
  let ref = REF;
  let state: 'running' | 'stopped' = action === 'start' ? 'stopped' : 'running';
  let executable = true;
  let failAfter = false;
  let failOwner = false;
  let failEvents = false;
  let previews = 0;

  const plan = (): FuturePlan => {
    const prior = action === 'start' ? 'stopped' : 'running';
    return {
      target: {
        kind: 'project-environment',
        projectId: PROJECT,
        environmentInstanceId: ENV,
      },
      action,
      status: 'ready',
      executable,
      expectedRevision: REV,
      planHash: HASH,
      observedAt: NOW.toISOString(),
      expiresAt: new Date(NOW.getTime() + 30_000).toISOString(),
      order: [ref],
      nodes: [
        {
          serviceRef: ref,
          name: ref.slice('systemd:user:'.length),
          provider: 'systemd',
          state,
          readiness: 'unknown',
          relation: 'required',
          consumerCount: 1,
          dependencies: [],
          ports: [],
          disposition:
            state === prior
              ? action === 'start'
                ? 'willStart'
                : 'willStop'
              : 'retained',
          systemdCapability: {
            status: 'supported',
            reason: 'Fixture-only future plan.',
          },
        },
      ],
      diagnostics: [],
    };
  };
  const planner = {
    preview: async () => {
      previews++;
      if (failAfter && previews >= 3)
        throw new Error('secret DBus /home/token');
      return plan();
    },
  };
  const runner = new SystemdConfirmedLifecycleRunner(
    {
      run: async (request) => {
        calls.push(request.serviceRef + ':' + request.action);
        const rows = journal.list();
        assert.equal(rows.length, 1);
        assert.equal(rows[0]?.stage, 'invoking');
        assert.equal(rows[0]?.inFlightRef, REF);
        assert.equal(rows[0]?.reconciliationRequired, false);
        if (failOwner)
          throw new Error('secret systemctl /home/user/credential');
        state = action === 'start' ? 'running' : 'stopped';
        return {
          serviceRef: ref,
          action,
          outcome: 'changed' as const,
          state,
          readiness: 'unknown' as const,
        };
      },
    },
    { now: () => NOW },
  );
  const eventsWriter = new ConfirmedServiceLifecycleActivityWriter({
    activityEvents: {
      append: async (entry) => {
        if (failEvents) throw new Error('private Activity storage');
        events.push(entry);
        return {} as never;
      },
    },
  });
  const coordinator = new SystemdConfirmedLifecycleCoordinator(
    {
      planner,
      runner,
      locks,
      jobs: journal,
      events: eventsWriter,
    },
    { now: () => NOW },
  );
  return {
    coordinator,
    journal,
    locks,
    events,
    calls,
    setRef: (value: string) => {
      ref = value;
    },
    setExecutable: (value: boolean) => {
      executable = value;
    },
    setFailAfter: () => {
      failAfter = true;
    },
    setFailOwner: () => {
      failOwner = true;
    },
    setFailEvents: () => {
      failEvents = true;
    },
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

test('Start and Stop persist invoking before owner; Activity is sanitized security event', async () => {
  for (const action of ['start', 'stop'] as const) {
    const f = setup(action);
    try {
      const result = await f.coordinator.run(confirmation(action));
      assert.equal(result.status, 'completed');
      assert.equal(result.steps[0]?.state, 'completed');
      assert.deepEqual(f.calls, [REF + ':' + action]);
      const rows = f.journal.list();
      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.status, 'completed');
      assert.equal(rows[0]?.stage, 'finished');
      assert.equal(rows[0]?.reconciliationRequired, false);
      assert.equal(rows[0]?.steps[0]?.state, 'completed');
      assert.equal(f.events.length, 1);
      assert.equal(f.events[0]?.domain, 'security');
      assert.equal(f.events[0]?.type, 'systemd.user.confirmed-' + action);
      assert.equal(f.events[0]?.status, 'succeeded');
      assert.deepEqual(f.journal.activityJobs(PROJECT), []);
    } finally {
      f.cleanup();
    }
  }
});

test('production-style executable:false plan cannot create Job or invoke owner', async () => {
  const f = setup();
  try {
    f.setExecutable(false);
    await assert.rejects(
      f.coordinator.run(confirmation()),
      /confirmation is unavailable/,
    );
    assert.deepEqual(f.journal.list(), []);
    assert.deepEqual(f.calls, []);
    assert.deepEqual(f.events, []);
  } finally {
    f.cleanup();
  }
});

test('stale confirmation, mismatched action and unsafe refs create no Job', async () => {
  const f = setup();
  try {
    for (const input of [
      { ...confirmation(), expectedPlanHash: 'c'.repeat(64) },
      {
        ...confirmation(),
        acceptedObservedAt: new Date(NOW.getTime() - 30_001).toISOString(),
      },
      {
        ...confirmation(),
        acceptedObservedAt: new Date(NOW.getTime() + 1).toISOString(),
      },
      {
        ...confirmation(),
        environmentInstanceId: 'environment:primary:foreign',
      },
      { ...confirmation(), action: 'stop' as const },
    ])
      await assert.rejects(f.coordinator.run(input));
    for (const identity of [
      'systemd:system:postgresql.service',
      'systemd:user:dev-dashboard.service',
      'systemd:user:worker@.service',
      'systemd:user:../evil.service',
      'compose:demo:api',
    ]) {
      f.setRef(identity);
      await assert.rejects(f.coordinator.run(confirmation()));
    }
    assert.deepEqual(f.journal.list(), []);
    assert.deepEqual(f.calls, []);
  } finally {
    f.cleanup();
  }
});

test('owner failure persists sanitized partial and never automatically replays', async () => {
  const f = setup();
  try {
    f.setFailOwner();
    const result = await f.coordinator.run(confirmation());
    assert.equal(result.status, 'partial');
    assert.equal(result.steps[0]?.state, 'failed');
    assert.doesNotMatch(JSON.stringify(result), /secret|\/home\//);
    const job = f.journal.list()[0]!;
    assert.equal(job.status, 'partial');
    assert.equal(job.reconciliationRequired, true);
    assert.equal(f.events[0]?.status, 'failed');
    assert.doesNotMatch(JSON.stringify(f.events), /secret|\/home\//);
    await assert.rejects(
      f.coordinator.run(confirmation()),
      /journal is unavailable/,
    );
    assert.equal(f.calls.length, 1);
    assert.equal(
      f.journal.activityJobs(PROJECT)[0]?.stage,
      'reconciliation-required',
    );
  } finally {
    f.cleanup();
  }
});

test('post-command observation failure remains unverified partial', async () => {
  const f = setup();
  try {
    f.setFailAfter();
    const result = await f.coordinator.run(confirmation());
    assert.equal(result.status, 'partial');
    assert.equal(result.steps[0]?.state, 'unverified');
    assert.equal(f.events[0]?.status, 'warning');
    assert.doesNotMatch(JSON.stringify(result), /secret|\/home\//);
    assert.equal(f.journal.list()[0]?.reconciliationRequired, true);
    assert.equal(f.calls.length, 1);
  } finally {
    f.cleanup();
  }
});

test('Activity failure cannot replay the owner or discard the durable Job', async () => {
  const f = setup();
  try {
    f.setFailEvents();
    const result = await f.coordinator.run(confirmation());
    assert.equal(result.status, 'completed');
    assert.equal(f.journal.list()[0]?.status, 'completed');
    assert.equal(f.calls.length, 1);
  } finally {
    f.cleanup();
  }
});

test('environment lease conflict denies before a journal intent is written', async () => {
  const f = setup();
  try {
    await f.locks.withResources(
      ['environment:' + PROJECT + ':' + ENV],
      async () => {
        await assert.rejects(
          f.coordinator.run(confirmation()),
          /already using/,
        );
      },
    );
    assert.deepEqual(f.calls, []);
    assert.deepEqual(f.journal.list(), []);
  } finally {
    f.cleanup();
  }
});

test('an existing orphaned invoking Job blocks a new confirmation without replay', async () => {
  const f = setup();
  try {
    const request = confirmation();
    const id = f.journal.begin(request, [REF]);
    f.journal.beforeStep(id, REF);
    await assert.rejects(f.coordinator.run(request), /journal is unavailable/);
    assert.deepEqual(f.calls, []);
    assert.equal(f.journal.get(id)?.stage, 'invoking');
  } finally {
    f.cleanup();
  }
});
