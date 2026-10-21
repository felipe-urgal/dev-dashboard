import assert from 'node:assert/strict';
import test from 'node:test';

import type { ServiceCatalogSnapshot } from '@dev-dashboard/contracts';

import type { ConfirmedLifecycleJob } from '../src/services/confirmed-lifecycle-job-journal.js';
import { ConfirmedLifecycleReconciliationService } from '../src/services/confirmed-lifecycle-reconciliation-service.js';

const REF = 'compose:loto:api';
const DB = 'compose:loto:database';
const job: ConfirmedLifecycleJob = {
  version: 1,
  id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
  projectId: 'loto',
  environmentInstanceId: 'environment:primary:loto',
  action: 'start',
  expectedRevision: 'a'.repeat(64),
  expectedPlanHash: 'b'.repeat(64),
  status: 'running',
  stage: 'invoking',
  plannedRefs: [DB, REF],
  inFlightRef: REF,
  steps: [
    {
      serviceRef: DB,
      action: 'start',
      state: 'completed',
      dispositionBefore: 'willStart',
    },
  ],
  startedAt: '2026-10-20T11:00:00.000Z',
  updatedAt: '2026-10-20T11:01:00.000Z',
  reconciliationRequired: true,
};
function fixture() {
  let current = structuredClone(job);
  const snapshot: ServiceCatalogSnapshot = {
    status: 'ready',
    observedAt: '2026-10-20T11:02:00.000Z',
    truncated: false,
    providers: [
      { provider: 'compose', status: 'ready' },
      { provider: 'ports', status: 'ready' },
    ],
    ports: [],
    entries: [DB, REF].map((id) => ({
      id,
      provider: 'compose',
      name: id,
      state: 'running',
      readiness: 'ready',
      ownership: 'confirmed',
      scope: 'environment',
      projectId: 'loto',
      observedAt: '2026-10-20T11:02:00.000Z',
      ports: [],
    })),
  };
  let fail = false;
  const service = new ConfirmedLifecycleReconciliationService({
    projects: {
      findProject: (id) =>
        id === 'loto' || id === 'gastos' ? ({ id } as never) : null,
    },
    journal: {
      get: (id) => (id === current.id ? current : null),
      list: (projectId?: string) =>
        !projectId || projectId === current.projectId ? [current] : [],
    },
    catalog: {
      inspect: async () => {
        if (fail) throw Error('system host secret in runtime error');
        return snapshot;
      },
    },
  });
  return {
    service,
    snapshot,
    setJob: (newJob: ConfirmedLifecycleJob) => {
      current = newJob;
    },
    fail: () => {
      fail = true;
    },
  };
}

test('in-flight start with healthy observed state never authorizes retry or completion', async () => {
  const f = fixture();
  const report = await f.service.inspect('loto', job.id);
  assert.equal(report.safeToRetry, false);
  assert.equal(report.reconciliationRequired, true);
  assert.equal(report.possibleActiveExecution, true);
  assert.equal(report.nodes.length, 2);
  assert.deepEqual(
    report.nodes.map((n) => n.journalState),
    ['completed', 'in-flight'],
  );
  assert.equal(report.nodes[1]?.assessment, 'matches-target');
  assert.match(report.diagnostics.join(' '), /Do not retry/);
  assert.equal(report.inFlightRef, REF);
  assert.doesNotMatch(JSON.stringify(report), /expectedPlanHash/);
});

test('catalog partial or runtime unavailable produces unverifiable diagnostics', async () => {
  const f = fixture();
  f.snapshot.truncated = true;
  let report = await f.service.inspect('loto', job.id);
  assert.equal(report.observationComplete, false);
  assert.equal(
    report.nodes.every((n) => n.assessment === 'unverifiable'),
    true,
  );
  f.fail();
  report = await f.service.inspect('loto', job.id);
  assert.equal(report.observationComplete, false);
  assert.equal(report.safeToRetry, false);
  assert.doesNotMatch(JSON.stringify(report), /system host secret/);
});

test('unmanaged, cross-project, absent or ambiguous identities fail closed', async () => {
  const f = fixture();
  const entry = f.snapshot.entries[1]!;
  entry.projectId = 'gastos';
  let report = await f.service.inspect('loto', job.id);
  assert.equal(report.nodes[1]?.assessment, 'unverifiable');
  assert.match(report.nodes[1]?.diagnostic ?? '', /ownership/);
  entry.projectId = 'loto';
  entry.ownership = 'unmanaged';
  report = await f.service.inspect('loto', job.id);
  assert.equal(report.nodes[1]?.assessment, 'unverifiable');
  entry.ownership = 'confirmed';
  f.snapshot.entries.push({ ...entry });
  report = await f.service.inspect('loto', job.id);
  assert.match(report.nodes[1]?.diagnostic ?? '', /ambiguous/);
  f.snapshot.entries.pop();
  f.snapshot.entries.pop();
  report = await f.service.inspect('loto', job.id);
  assert.equal(report.nodes[1]?.observedState, 'missing');
  assert.equal(report.nodes[1]?.assessment, 'unverifiable');
});

test('recorded completion can diverge from later observed service state', async () => {
  const f = fixture();
  f.setJob({
    ...job,
    status: 'completed',
    stage: 'finished',
    inFlightRef: undefined,
    reconciliationRequired: false,
    steps: [
      ...job.steps,
      {
        serviceRef: REF,
        action: 'start',
        state: 'completed',
        dispositionBefore: 'willStart',
      },
    ],
  });
  f.snapshot.entries[1]!.state = 'stopped';
  const report = await f.service.inspect('loto', job.id);
  assert.equal(report.journalStatus, 'completed');
  assert.equal(report.reconciliationRequired, true);
  assert.equal(report.possibleActiveExecution, false);
  assert.equal(report.nodes[1]?.assessment, 'diverged');
  assert.equal(report.safeToRetry, false);
});

test('list is project scoped and omits confirmation revisions and raw steps', () => {
  const f = fixture();
  const rows = f.service.list('loto');
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.id, job.id);
  assert.equal(rows[0]?.completedSteps, 1);
  assert.equal(rows[0]?.reconciliationRequired, true);
  assert.equal(f.service.list('gastos').length, 0);
  assert.equal('expectedRevision' in rows[0]!, false);
  assert.throws(() => f.service.list('nonexistent'), /not found/);
});

test('job id in another project is never disclosed', async () => {
  const f = fixture();
  await assert.rejects(f.service.inspect('gastos', job.id), /not found/);
  await assert.rejects(
    f.service.inspect('loto', 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'),
    /not found/,
  );
});

test('systemd user observation cannot prove prior ownership or readiness', async () => {
  const f = fixture();
  const ref = 'systemd:user:fixture-worker.service';
  f.setJob({
    ...job,
    plannedRefs: [ref],
    inFlightRef: ref,
    steps: [],
  });
  f.snapshot.providers.push({ provider: 'systemd', status: 'ready' });
  f.snapshot.entries.push({
    id: ref,
    provider: 'systemd',
    name: 'fixture-worker.service',
    state: 'running',
    readiness: 'unknown',
    ownership: 'unmanaged',
    scope: 'user',
    observedAt: '2026-10-20T11:02:00.000Z',
    ports: [],
  });
  const found = await f.service.inspect('loto', job.id);
  assert.equal(found.observationComplete, true);
  assert.equal(found.safeToRetry, false);
  assert.equal(found.possibleActiveExecution, true);
  assert.equal(found.nodes[0]?.journalState, 'in-flight');
  assert.equal(found.nodes[0]?.observedState, 'running');
  assert.equal(found.nodes[0]?.assessment, 'unverifiable');
  assert.match(found.nodes[0]?.diagnostic ?? '', /does not prove an authorized project binding/);
  assert.doesNotMatch(JSON.stringify(found), /expectedPlanHash/);
});
