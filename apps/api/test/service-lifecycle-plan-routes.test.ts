import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  Project,
  ServiceCatalogSnapshot,
  ServiceLifecyclePlan,
} from '@dev-dashboard/contracts';

import { buildApp } from '../src/app.js';
import { createAppContext } from '../src/app-context.js';

const TOKEN = 'p'.repeat(64);
const REF = 'systemd:system:postgresql.service';

test('project lifecycle preview is authenticated, read-only and hash guarded', async (t) => {
  const context = createAppContext();
  const project: Project = {
    id: 'loto',
    name: 'Loto Lab',
    workspaceId: 'test',
    path: '/tmp/loto',
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
  // The hash tracks services bound to this project, not arbitrary host services.
  context.projectServiceBindingStore.save(
    'loto',
    {
      environmentInstanceId: 'environment:primary:loto',
      serviceRef: REF,
      relation: 'required',
      requiredForStart: true,
      enabled: true,
      dependencies: [],
    },
    context.projectServiceBindingStore.revision('loto'),
    new Date('2026-10-19T16:00:00.000Z'),
  );
  const catalog: ServiceCatalogSnapshot = {
    status: 'ready',
    observedAt: '2026-10-19T16:00:00.000Z',
    truncated: false,
    ports: [],
    providers: [{ provider: 'systemd', status: 'ready' }],
    entries: [
      {
        id: REF,
        provider: 'systemd',
        name: 'postgresql.service',
        scope: 'system',
        state: 'running',
        readiness: 'unknown',
        ownership: 'unmanaged',
        ports: [],
        observedAt: '2026-10-19T16:00:00.000Z',
      },
    ],
  };
  const app = await buildApp({
    context,
    localToken: TOKEN,
    serviceCatalog: { inspect: async () => catalog },
  });
  t.after(async () => app.close());

  const uri = '/api/projects/loto/service-plan?action=start';
  const denied = await app.inject({ method: 'GET', url: uri });
  assert.equal(denied.statusCode, 401);

  const headers = { 'x-dev-dashboard-token': TOKEN };
  const original = await app.inject({ method: 'GET', url: uri, headers });
  assert.equal(original.statusCode, 200);
  const first = original.json<ServiceLifecyclePlan>();
  assert.equal(first.target.projectId, 'loto');
  assert.equal(first.status, 'blocked');
  assert.deepEqual(first.order, [REF]);
  assert.equal(first.nodes[0]?.state, 'running');
  assert.equal(first.executable, false);
  assert.equal(first.planHash.length, 64);

  const repeat = await app.inject({
    method: 'GET',
    url: uri + '&expectedPlanHash=' + first.planHash,
    headers,
  });
  assert.equal(repeat.statusCode, 200);

  catalog.entries[0]!.state = 'stopped';
  const stale = await app.inject({
    method: 'GET',
    url: uri + '&expectedPlanHash=' + first.planHash,
    headers,
  });
  assert.equal(stale.statusCode, 409);

  const mutation = await app.inject({ method: 'POST', url: uri, headers });
  assert.notEqual(mutation.statusCode, 200);

  const invalid = await app.inject({
    method: 'GET',
    url: '/api/projects/loto/service-plan?action=restart',
    headers,
  });
  assert.equal(invalid.statusCode, 400);
});
