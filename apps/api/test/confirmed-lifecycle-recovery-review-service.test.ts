import assert from 'node:assert/strict';
import test from 'node:test';

import type { AppendActivityEventInput } from '@dev-dashboard/core';

import type { LifecycleReconciliationReport } from '../src/services/confirmed-lifecycle-reconciliation-service.js';
import { ConfirmedLifecycleRecoveryReviewService } from '../src/services/confirmed-lifecycle-recovery-review-service.js';

const JOB = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const REF = 'compose:loto:api';
const report: LifecycleReconciliationReport = {
  jobId: JOB,
  projectId: 'loto',
  environmentInstanceId: 'environment:primary:loto',
  action: 'start',
  journalStatus: 'running',
  stage: 'invoking',
  inFlightRef: REF,
  startedAt: '2026-10-20T12:00:00.000Z',
  updatedAt: '2026-10-20T12:00:01.000Z',
  observedAt: '2026-10-20T12:00:02.000Z',
  observationComplete: true,
  reconciliationRequired: true,
  possibleActiveExecution: true,
  safeToRetry: false,
  nodes: [
    {
      serviceRef: REF,
      journalState: 'in-flight',
      observedState: 'running',
      readiness: 'ready',
      assessment: 'matches-target',
      diagnostic: 'Observed state matches target.',
    },
  ],
  diagnostics: [],
};

function harness() {
  const events: AppendActivityEventInput[] = [];
  const inspected: string[][] = [];
  let broken = false;
  const service = new ConfirmedLifecycleRecoveryReviewService(
    {
      reconciliation: {
        inspect: async (project, job) => {
          if (project !== 'loto' || job !== JOB) {
            throw new Error('Lifecycle job not found for project.');
          }
          return report;
        },
      },
      leases: {
        inspect: (keys) => {
          if (broken) throw new Error('Host FS secret path');
          inspected.push([...keys]);
          return keys.map((resourceKey) => ({
            resourceKey,
            status: 'present' as const,
            ownerProcess: 'not-observed' as const,
            processIdentity: 'unverifiable' as const,
            diagnostic: 'PID no longer observed; does not prove safety.',
          }));
        },
      },
      activity: {
        append: async (event) => {
          events.push(event);
          return {} as never;
        },
      },
    },
    { now: () => new Date('2026-10-20T12:01:00.000Z') },
  );
  return {
    service,
    events,
    inspected,
    failLeases: () => {
      broken = true;
    },
  };
}

test('inspects Compose owner, resource and environment locks without granting recovery', async () => {
  const x = harness();
  const evidence = await x.service.inspect('loto', JOB);
  assert.equal(evidence.safeToRetry, false);
  assert.equal(evidence.leaseReleaseAuthorized, false);
  assert.equal(evidence.otherInstancesExcluded, false);
  assert.equal(evidence.manualReviewRequired, true);
  assert.deepEqual(x.inspected[0], [
    'environment:loto:environment:primary:loto',
    'resource:' + REF,
    'compose-project:loto',
  ]);
  assert.equal(evidence.leases.length, 3);
  assert.equal(evidence.leases[0]?.ownerProcess, 'not-observed');
  assert.match(evidence.diagnostics.join(' '), /Do not clear leases/);
  assert.deepEqual(x.events, []);
});

test('records a sanitized Activity review, not a completion or restart authorization', async () => {
  const x = harness();
  const result = await x.service.recordReview('loto', JOB);
  assert.deepEqual(result, {
    recorded: true,
    safeToRetry: false,
    leaseReleaseAuthorized: false,
  });
  assert.equal(x.events.length, 1);
  assert.equal(x.events[0]?.type, 'compose.lifecycle-recovery-reviewed');
  assert.equal(x.events[0]?.status, 'warning');
  assert.equal(x.events[0]?.jobId, 'compose-confirmed:' + JOB);
  assert.equal(x.events[0]?.resourceRef?.id, JOB);
  assert.doesNotMatch(JSON.stringify(x.events), /PID no longer observed/);
});

test('no job access means no lease inspection and no event', async () => {
  const x = harness();
  await assert.rejects(x.service.recordReview('other', JOB), /not found/);
  assert.deepEqual(x.events, []);
  assert.deepEqual(x.inspected, []);
});

test('lease observer errors fail closed without exposing host paths', async () => {
  const x = harness();
  x.failLeases();
  const evidence = await x.service.inspect('loto', JOB);
  assert.equal(evidence.leases.length, 3);
  assert.ok(evidence.leases.every((lease) => lease.status === 'unverifiable'));
  assert.equal(evidence.safeToRetry, false);
  assert.doesNotMatch(JSON.stringify(evidence), /Host FS secret path/);
});
