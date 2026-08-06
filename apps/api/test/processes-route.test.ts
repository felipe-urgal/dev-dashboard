import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import type { ManagedProcess, Project } from '@dev-dashboard/contracts';

const TOKEN = 'p'.repeat(64);

interface ProcessesResponse {
  processes: ManagedProcess[];
}

test('GET /api/processes lists managed server and test processes for known projects', async (context) => {
  const fixtureRoot = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-processes-route-'),
  );
  const previousConfigDirectory = process.env.DEV_DASHBOARD_CONFIG_DIR;
  const previousStateDirectory = process.env.DEV_DASHBOARD_STATE_DIR;
  process.env.DEV_DASHBOARD_CONFIG_DIR = path.join(fixtureRoot, 'config');
  process.env.DEV_DASHBOARD_STATE_DIR = path.join(fixtureRoot, 'state');

  const { buildApp } = await import('../src/app.js');
  const { createAppContext } = await import('../src/app-context.js');
  const context_ = createAppContext();

  const knownProject: Project = {
    id: 'p1',
    name: 'sample-node',
    path: '/tmp/sample-node',
    type: 'node',
    source: 'workspace',
    workspaceId: 'w1',
    favorite: false,
    capabilities: ['server'],
  };
  const otherProject: Project = {
    id: 'p2',
    name: 'sample-rails',
    path: '/tmp/sample-rails',
    type: 'rails',
    source: 'workspace',
    workspaceId: 'w2',
    favorite: false,
    capabilities: ['server'],
  };
  context_.projectStore.saveWorkspaceScan({
    workspaceId: 'w1',
    workspacePath: '/tmp/w1',
    projects: [knownProject],
    warnings: [],
  });
  context_.projectStore.saveWorkspaceScan({
    workspaceId: 'w2',
    workspacePath: '/tmp/w2',
    projects: [otherProject],
    warnings: [],
  });

  const managed: ManagedProcess[] = [
    {
      id: 'srv-p1',
      projectId: 'p1',
      kind: 'server',
      status: 'running',
      pid: 1000,
      startedAt: '2026-07-26T09:00:00Z',
    },
    {
      id: 'tst-p1',
      projectId: 'p1',
      kind: 'test',
      status: 'stopped',
      startedAt: '2026-07-26T08:00:00Z',
    },
    {
      id: 'srv-p2',
      projectId: 'p2',
      kind: 'server',
      status: 'running',
      startedAt: '2026-07-26T07:00:00Z',
    },
    {
      id: 'ghost',
      projectId: 'p-missing',
      kind: 'server',
      status: 'running',
      startedAt: '2026-07-26T06:00:00Z',
    },
    {
      id: 'script-run',
      projectId: 'p1',
      kind: 'script',
      status: 'running',
      startedAt: '2026-07-26T05:00:00Z',
    },
  ];
  context_.processManager.listProcesses = async () => managed;

  const app = await buildApp({ localToken: TOKEN, context: context_ });
  context.after(async () => {
    await app.close();
    if (previousConfigDirectory === undefined)
      delete process.env.DEV_DASHBOARD_CONFIG_DIR;
    else process.env.DEV_DASHBOARD_CONFIG_DIR = previousConfigDirectory;
    if (previousStateDirectory === undefined)
      delete process.env.DEV_DASHBOARD_STATE_DIR;
    else process.env.DEV_DASHBOARD_STATE_DIR = previousStateDirectory;
    await rm(fixtureRoot, { recursive: true, force: true });
  });

  const headers = { 'x-dev-dashboard-token': TOKEN };

  await context.test(
    'returns only server and test processes owned by known projects',
    async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/processes',
        headers,
      });
      assert.equal(response.statusCode, 200);
      const body = response.json<ProcessesResponse>();
      const ids = body.processes.map((process) => process.id).sort();
      assert.deepEqual(ids, ['srv-p1', 'srv-p2', 'tst-p1']);
    },
  );

  await context.test('filters by workspaceId', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/processes?workspaceId=w1',
      headers,
    });
    assert.equal(response.statusCode, 200);
    const body = response.json<ProcessesResponse>();
    assert.deepEqual(body.processes.map((process) => process.id).sort(), [
      'srv-p1',
      'tst-p1',
    ]);
  });

  await context.test('filters by kind', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/processes?kind=test',
      headers,
    });
    assert.equal(response.statusCode, 200);
    const body = response.json<ProcessesResponse>();
    assert.deepEqual(
      body.processes.map((process) => process.id),
      ['tst-p1'],
    );
  });

  await context.test('requires authentication', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/processes' });
    assert.equal(response.statusCode, 401);
  });
});
