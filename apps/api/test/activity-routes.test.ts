import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { ActivitySnapshot, Project } from '@dev-dashboard/contracts';

const TOKEN = 'a'.repeat(64);

test('Activity HTTP expõe snapshots por projeto/global com autenticação e limites', async (context) => {
  const fixtureRoot = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-activity-http-'),
  );
  const projectPath = path.join(fixtureRoot, 'project');
  await mkdir(projectPath, { recursive: true });

  const previousConfigDirectory = process.env.DEV_DASHBOARD_CONFIG_DIR;
  const previousStateDirectory = process.env.DEV_DASHBOARD_STATE_DIR;
  process.env.DEV_DASHBOARD_CONFIG_DIR = path.join(fixtureRoot, 'config');
  process.env.DEV_DASHBOARD_STATE_DIR = path.join(fixtureRoot, 'state');

  const { buildApp } = await import('../src/app.js');
  const { createAppContext } = await import('../src/app-context.js');
  const appContext = createAppContext();
  const project: Project = {
    id: 'project-a',
    name: 'Project A',
    path: projectPath,
    type: 'node',
    source: 'workspace',
    workspaceId: 'workspace-a',
    enabled: true,
    capabilities: [],
  };
  appContext.projectStore.saveWorkspaceScan({
    workspaceId: 'workspace-a',
    workspacePath: fixtureRoot,
    projects: [project],
    warnings: [],
  });
  await appContext.activityEventRepository.append({
    projectId: project.id,
    domain: 'database',
    type: 'database.snapshot',
    status: 'succeeded',
    summary: 'Snapshot concluído',
    occurredAt: '2026-09-19T12:00:00.000Z',
  });

  const app = await buildApp({ localToken: TOKEN, context: appContext });
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

  const unauthorized = await app.inject({
    method: 'GET',
    url: '/api/activity',
  });
  assert.equal(unauthorized.statusCode, 401);

  const headers = { 'x-dev-dashboard-token': TOKEN };

  const projectResponse = await app.inject({
    method: 'GET',
    url: '/api/projects/project-a/activity?limit=10',
    headers,
  });
  assert.equal(projectResponse.statusCode, 200);
  const projectActivity =
    projectResponse.json<{ activity: ActivitySnapshot }>().activity;
  assert.equal(
    projectActivity.events.some(
      (event) =>
        event.domain === 'database' && event.type === 'database.snapshot',
    ),
    true,
  );
  assert.equal(Array.isArray(projectActivity.jobs), true);

  const globalResponse = await app.inject({
    method: 'GET',
    url: '/api/activity?limit=10',
    headers,
  });
  assert.equal(globalResponse.statusCode, 200);
  const globalActivity =
    globalResponse.json<{ activity: ActivitySnapshot }>().activity;
  assert.equal(
    globalActivity.events.some((event) => event.projectId === project.id),
    true,
  );

  for (const limit of ['0', '201', 'abc']) {
    const invalid = await app.inject({
      method: 'GET',
      url: `/api/activity?limit=${limit}`,
      headers,
    });
    assert.equal(invalid.statusCode, 400);
  }

  const missing = await app.inject({
    method: 'GET',
    url: '/api/projects/missing/activity',
    headers,
  });
  assert.equal(missing.statusCode, 404);
  assert.equal(
    missing.json<{ error: string }>().error,
    'PROJECT_NOT_FOUND',
  );

  const serialized = JSON.stringify({
    projectActivity,
    globalActivity,
  });
  assert.equal(serialized.includes(projectPath), false);
});
