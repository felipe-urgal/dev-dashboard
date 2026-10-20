import assert from 'node:assert/strict';
import test from 'node:test';

import type { Project, ServiceCatalogSnapshot } from '@dev-dashboard/contracts';

import { buildApp } from '../src/app.js';
import { createAppContext } from '../src/app-context.js';
import type { ConfirmedLifecycleJob } from '../src/services/confirmed-lifecycle-job-journal.js';

const TOKEN = 'r'.repeat(64);
const ID = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const REF = 'compose:loto:api';

test('reconciliation HTTP is authenticated, read-only and project scoped', async (t) => {
  const context = createAppContext();
  const project: Project = {
    id: 'loto',
    name: 'Loto Lab',
    path: '/tmp/loto',
    workspaceId: 'test',
    source: 'workspace',
    type: 'node',
    enabled: true,
    capabilities: [],
  };
  context.projectStore.saveWorkspaceScan({
    workspaceId: 'test',
    workspacePath: '/tmp',
    projects: [project],
    warnings: [],
  });
  const job: ConfirmedLifecycleJob = {
    version: 1,
    id: ID,
    projectId: 'loto',
    environmentInstanceId: 'environment:primary:loto',
    action: 'stop',
    expectedRevision: 'a'.repeat(64),
    expectedPlanHash: 'b'.repeat(64),
    status: 'running',
    stage: 'invoking',
    inFlightRef: REF,
    plannedRefs: [REF],
    steps: [],
    startedAt: '2026-10-20T10:00:00.000Z',
    updatedAt: '2026-10-20T10:01:00.000Z',
    reconciliationRequired: true,
  };
  const snapshot: ServiceCatalogSnapshot = {
    status: 'ready',
    observedAt: '2026-10-20T10:02:00.000Z',
    providers: [{ provider: 'compose', status: 'ready' }],
    truncated: false,
    ports: [],
    entries: [
      {
        id: REF,
        name: 'api',
        provider: 'compose',
        state: 'stopped',
        readiness: 'unknown',
        ownership: 'confirmed',
        projectId: 'loto',
        scope: 'environment',
        ports: [],
        observedAt: '2026-10-20T10:02:00.000Z',
      },
    ],
  };
  const app = await buildApp({
    context,
    localToken: TOKEN,
    serviceCatalog: { inspect: async () => snapshot },
    confirmedLifecycleJobs: {
      get: (id) => (id === ID ? job : null),
      list: (projectId?: string) =>
        !projectId || projectId === 'loto' ? [job] : [],
      activityJobs: () => [],
    },
  });
  t.after(async () => app.close());

  const base = '/api/projects/loto/service-jobs';
  assert.equal(
    (await app.inject({ method: 'GET', url: base })).statusCode,
    401,
  );
  const headers = { 'x-dev-dashboard-token': TOKEN };
  const list = await app.inject({ method: 'GET', url: base, headers });
  assert.equal(list.statusCode, 200);
  assert.equal(list.json().jobs[0].id, ID);
  assert.equal(list.json().jobs[0].inFlightRef, REF);
  assert.equal(list.json().jobs[0].expectedPlanHash, undefined);

  const url = base + '/' + ID + '/reconciliation';
  const detail = await app.inject({ method: 'GET', url, headers });
  assert.equal(detail.statusCode, 200);
  const body = detail.json();
  assert.equal(body.journalStatus, 'running');
  assert.equal(body.possibleActiveExecution, true);
  assert.equal(body.safeToRetry, false);
  assert.equal(body.nodes[0].assessment, 'matches-target');
  assert.equal(body.nodes[0].journalState, 'in-flight');
  assert.equal(body.expectedRevision, undefined);

  const invalid = await app.inject({
    method: 'GET',
    headers,
    url: base + '/../../invalid/reconciliation',
  });
  assert.notEqual(invalid.statusCode, 200);
  assert.equal(
    (await app.inject({ method: 'POST', url, headers })).statusCode,
    404,
  );
  assert.equal(
    (
      await app.inject({
        method: 'GET',
        headers,
        url: '/api/projects/other/service-jobs/' + ID + '/reconciliation',
      })
    ).statusCode,
    404,
  );
});
