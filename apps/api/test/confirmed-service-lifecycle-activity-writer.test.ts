import assert from 'node:assert/strict';
import test from 'node:test';

import type { AppendActivityEventInput } from '@dev-dashboard/core';
import type {
  ConfirmedLifecycleRequest,
  ConfirmedLifecycleStep,
} from '@dev-dashboard/contracts';

import { ConfirmedServiceLifecycleActivityWriter } from '../src/services/confirmed-service-lifecycle-activity-writer.js';

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
    activityEvents: { append: async (event) => { events.push(event); return {} as never; } },
  });
  for (const state of ['completed', 'failed', 'unverified'] as const) {
    const step: ConfirmedLifecycleStep = {
      action: 'start', serviceRef: 'compose:loto:api',
      dispositionBefore: 'willStart', state,
      diagnostic: 'password=not-for-logging',
    };
    await writer.append(step, request);
  }
  assert.deepEqual(events.map((e) => e.status), ['succeeded', 'failed', 'warning']);
  assert.equal(events.every((e) =>
    e.domain === 'compose' &&
    e.projectId === 'loto' &&
    e.environmentInstanceId === 'environment:primary:loto' &&
    e.resourceRef?.id === 'compose:loto:api'), true);
  assert.doesNotMatch(JSON.stringify(events), /password=not-for-logging/);
  assert.equal(events.every((e) => e.summary.length <= 240), true);
});

test('step-writer reports existing repository failure without claiming success', async () => {
  const writer = new ConfirmedServiceLifecycleActivityWriter({
    activityEvents: {
      append: async () => { throw new Error('Activity store unavailable'); },
    },
  });
  await assert.rejects(writer.append({
    action: 'stop', serviceRef: 'compose:loto:db',
    dispositionBefore: 'willStop', state: 'failed',
  }, { ...request, action: 'stop' }), /Activity store unavailable/);
});
