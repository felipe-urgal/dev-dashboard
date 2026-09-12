import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

const TOKEN = 't'.repeat(64);
const WORKTREE_ENVIRONMENT_ID = 'environment:worktree:p1:wt-1';

interface StatusResponse {
  snapshot: { status: string } | null;
}

interface ErrorResponse {
  error?: string;
}

test('rotas de PTY de testes respeitam a instância de ambiente', async (context) => {
  const fixtureRoot = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-test-pty-routes-'),
  );
  const projectPath = path.join(fixtureRoot, 'sample');
  const worktreePath = path.join(fixtureRoot, 'sample-worktree');
  await mkdir(projectPath, { recursive: true });
  await mkdir(worktreePath, { recursive: true });

  const previousConfigDirectory = process.env.DEV_DASHBOARD_CONFIG_DIR;
  const previousStateDirectory = process.env.DEV_DASHBOARD_STATE_DIR;
  process.env.DEV_DASHBOARD_CONFIG_DIR = path.join(fixtureRoot, 'config');
  process.env.DEV_DASHBOARD_STATE_DIR = path.join(fixtureRoot, 'state');

  const { buildApp } = await import('../src/app.js');
  const { createAppContext } = await import('../src/app-context.js');

  const appContext = createAppContext();
  const project: Project = {
    id: 'p1',
    name: 'sample',
    path: projectPath,
    type: 'node',
    source: 'workspace',
    workspaceId: 'w1',
    enabled: true,
    capabilities: [],
  };
  appContext.projectStore.saveWorkspaceScan({
    workspaceId: 'w1',
    workspacePath: fixtureRoot,
    projects: [project],
    warnings: [],
  });
  appContext.developmentEnvironmentInstanceStore.reconcileWorktrees('p1', [
    { id: 'wt-1', path: worktreePath, kind: 'linked' },
  ]);

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

  const headers = { 'x-dev-dashboard-token': TOKEN };

  await context.test('sem id usa a instância primary', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/projects/p1/tests/pty/status',
      headers,
    });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json<StatusResponse>(), { snapshot: null });
  });

  await context.test(
    'resolve o worktree por environmentInstanceId',
    async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/projects/p1/tests/pty/status?environmentInstanceId=${encodeURIComponent(WORKTREE_ENVIRONMENT_ID)}`,
        headers,
      });
      assert.equal(response.statusCode, 200);
      assert.deepEqual(response.json<StatusResponse>(), { snapshot: null });
    },
  );

  await context.test(
    'retorna 404 para environmentInstanceId inexistente',
    async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/projects/p1/tests/pty/status?environmentInstanceId=environment%3Aworktree%3Ap1%3Amissing',
        headers,
      });
      assert.equal(response.statusCode, 404);
      assert.equal(
        response.json<ErrorResponse>().error,
        'ENVIRONMENT_INSTANCE_NOT_FOUND',
      );
    },
  );
});
