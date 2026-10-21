import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { AppendActivityEventInput } from '@dev-dashboard/core';
import type {
  ConfirmedLifecycleRequest,
  ConfirmedLifecycleStep,
} from '@dev-dashboard/contracts';

import { ConfirmedServiceLifecycleActivityWriter } from '../src/services/confirmed-service-lifecycle-activity-writer.js';
import { ConfirmedLifecycleJobJournal } from '../src/services/confirmed-lifecycle-job-journal.js';

const request: ConfirmedLifecycleRequest = {
  projectId: 'loto',
  environmentInstanceId: 'environment:primary:loto',
  action: 'start',
  expectedRevision: 'a'.repeat(64),
  expectedPlanHash: 'b'.repeat(64),
  acceptedObservedAt: '2026-10-20T10:00:00.000Z',
};

test('records verified, failed and unverified steps with existing Activity domain', async () => {
  const events: AppendActivityEventInput[] = [];
  const writer = new ConfirmedServiceLifecycleActivityWriter({
    activityEvents: {
      append: async (event) => {
        events.push(event);
        return {} as never;
      },
    },
  });
  for (const state of ['completed', 'failed', 'unverified'] as const) {
    const step: ConfirmedLifecycleStep = {
      action: 'start',
      serviceRef: 'compose:loto:api',
      dispositionBefore: 'willStart',
      state,
      diagnostic: 'password=not-for-logging',
    };
    await writer.append(step, request);
  }
  assert.deepEqual(
    events.map((e) => e.status),
    ['succeeded', 'failed', 'warning'],
  );
  assert.equal(
    events.every(
      (e) =>
        e.domain === 'compose' &&
        e.projectId === 'loto' &&
        e.environmentInstanceId === 'environment:primary:loto' &&
        e.resourceRef?.id === 'compose:loto:api',
    ),
    true,
  );
  assert.doesNotMatch(JSON.stringify(events), /password=not-for-logging/);
  assert.equal(
    events.every((e) => e.summary.length <= 240),
    true,
  );
});

test('step-writer reports existing repository failure without claiming success', async () => {
  const writer = new ConfirmedServiceLifecycleActivityWriter({
    activityEvents: {
      append: async () => {
        throw new Error('Activity store unavailable');
      },
    },
  });
  await assert.rejects(
    writer.append(
      {
        action: 'stop',
        serviceRef: 'compose:loto:db',
        dispositionBefore: 'willStop',
        state: 'failed',
      },
      { ...request, action: 'stop' },
    ),
    /Activity store unavailable/,
  );
});

test('bounds long service references without truncation or losing stable identity', async () => {
  const events: AppendActivityEventInput[] = [];
  const writer = new ConfirmedServiceLifecycleActivityWriter({
    activityEvents: {
      append: async (event) => {
        events.push(event);
        return {} as never;
      },
    },
  });
  const oversized = 'compose:' + 'p'.repeat(150) + ':' + 'service'.repeat(20);
  const step: ConfirmedLifecycleStep = {
    action: 'stop',
    serviceRef: oversized,
    dispositionBefore: 'willStop',
    state: 'completed',
  };
  await writer.append(step, { ...request, action: 'stop' });
  await writer.append(step, { ...request, action: 'stop' });
  assert.equal(events[0]?.resourceRef?.id.length, 83);
  assert.equal(events[0]?.resourceRef?.id, events[1]?.resourceRef?.id);
  assert.match(
    events[0]?.resourceRef?.id ?? '',
    /^compose-ref-sha256:[a-f0-9]{64}$/,
  );
});

test('systemd user step is classified as security audit without leaking diagnostics', async () => {
  const events: AppendActivityEventInput[] = [];
  const writer = new ConfirmedServiceLifecycleActivityWriter({
    activityEvents: {
      append: async (event) => {
        events.push(event);
        return {} as never;
      },
    },
  });
  for (const state of ['completed', 'failed', 'unverified'] as const) {
    await writer.append(
      {
        serviceRef: 'systemd:user:fixture-worker.service',
        action: 'start',
        dispositionBefore: 'willStart',
        state,
        diagnostic: 'secret /home/developer/key',
      },
      request,
    );
  }
  assert.deepEqual(
    events.map((e) => e.domain),
    ['security', 'security', 'security'],
  );
  assert.deepEqual(
    events.map((e) => e.type),
    [
      'systemd.user.confirmed-start',
      'systemd.user.confirmed-start',
      'systemd.user.confirmed-start',
    ],
  );
  assert.deepEqual(
    events.map((e) => e.status),
    ['succeeded', 'failed', 'warning'],
  );
  assert.equal(events[0]?.resourceRef?.kind, 'systemd-user-unit');
  assert.equal(
    events[0]?.resourceRef?.id,
    'systemd:user:fixture-worker.service',
  );
  assert.doesNotMatch(JSON.stringify(events), /secret|\/home\//);
});

test('long systemd resource identity is hashed with provider-specific prefix', async () => {
  const events: AppendActivityEventInput[] = [];
  const writer = new ConfirmedServiceLifecycleActivityWriter({
    activityEvents: {
      append: async (event) => {
        events.push(event);
        return {} as never;
      },
    },
  });
  await writer.append(
    {
      serviceRef: 'systemd:user:' + 'a'.repeat(290) + '.service',
      action: 'stop',
      dispositionBefore: 'willStop',
      state: 'failed',
    },
    { ...request, action: 'stop' },
  );
  assert.match(
    events[0]?.resourceRef?.id ?? '',
    /^systemd-ref-sha256:[a-f0-9]{64}$/,
  );
  assert.equal(events[0]?.resourceRef?.kind, 'systemd-user-unit');
  assert.equal(events[0]?.domain, 'security');
});

test('correlation requires one matching persisted step and refuses forged Job identity', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'systemd-job-activity-'));
  try {
    const ref = 'systemd:user:fixture-worker.service';
    const step: ConfirmedLifecycleStep = {
      serviceRef: ref,
      action: 'start',
      dispositionBefore: 'willStart',
      state: 'completed',
      diagnostic: 'secret /home/user/key',
    };
    const journal = new ConfirmedLifecycleJobJournal(root, {
      now: () => new Date(request.acceptedObservedAt),
    });
    const events: AppendActivityEventInput[] = [];
    const writer = new ConfirmedServiceLifecycleActivityWriter({
      jobs: journal,
      activityEvents: {
        append: async (entry) => {
          events.push(entry);
          return {} as never;
        },
      },
    });
    const uuid = journal.begin(request, [ref]);
    await assert.rejects(
      writer.append(step, request, uuid),
      /identity could not be verified/,
    );
    journal.beforeStep(uuid, ref);
    await assert.rejects(
      writer.append(step, request, uuid),
      /identity could not be verified/,
    );
    journal.step(uuid, step);
    for (const wrong of [
      { ...request, projectId: 'unrelated-project' },
      { ...request, environmentInstanceId: 'environment:primary:unrelated' },
      { ...request, expectedRevision: 'c'.repeat(64) },
      { ...request, expectedPlanHash: 'd'.repeat(64) },
      { ...request, action: 'stop' as const },
    ]) {
      await assert.rejects(
        writer.append(step, wrong, uuid),
        /identity could not be verified/,
      );
    }
    await assert.rejects(
      writer.append({ ...step, state: 'unverified' }, request, uuid),
      /identity could not be verified/,
    );
    await assert.rejects(
      writer.append(step, request, '00000000-0000-4000-8000-000000000001'),
      /identity could not be verified/,
    );
    await assert.rejects(
      writer.append(step, request, 'not-a-uuid'),
      /identity could not be verified/,
    );
    assert.deepEqual(events, []);

    await writer.append(step, request, uuid);
    assert.equal(events.length, 1);
    assert.equal(events[0]?.jobId, 'systemd-user-confirmed:' + uuid);
    assert.equal(events[0]?.domain, 'security');
    assert.doesNotMatch(JSON.stringify(events), /secret|\/home\//);

    journal.finish(uuid, {
      projectId: request.projectId,
      environmentInstanceId: request.environmentInstanceId,
      action: 'start',
      status: 'completed',
      steps: [step],
    });
    await assert.rejects(
      writer.append(step, request, uuid),
      /identity could not be verified/,
    );
    assert.equal(events.length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('correlated Activity rejects unavailable journal without leaking storage diagnostics', async () => {
  const entries: AppendActivityEventInput[] = [];
  const writer = new ConfirmedServiceLifecycleActivityWriter({
    jobs: {
      get: () => {
        throw new Error('private path /home/secret');
      },
    },
    activityEvents: {
      append: async (value) => {
        entries.push(value);
        return {} as never;
      },
    },
  });
  await assert.rejects(
    writer.append(
      {
        serviceRef: 'systemd:user:fixture-worker.service',
        action: 'start',
        dispositionBefore: 'willStart',
        state: 'failed',
      },
      request,
      '00000000-0000-4000-8000-000000000001',
    ),
    /identity could not be verified/,
  );
  assert.deepEqual(entries, []);
});

test('correlated events cannot be emitted without any Job reader', async () => {
  const entries: AppendActivityEventInput[] = [];
  const writer = new ConfirmedServiceLifecycleActivityWriter({
    activityEvents: {
      append: async (entry) => {
        entries.push(entry);
        return {} as never;
      },
    },
  });
  await assert.rejects(
    writer.append(
      {
        serviceRef: 'systemd:user:fixture-worker.service',
        action: 'start',
        dispositionBefore: 'willStart',
        state: 'completed',
      },
      request,
      '00000000-0000-4000-8000-000000000001',
    ),
    /identity could not be verified/,
  );
  assert.deepEqual(entries, []);
});
