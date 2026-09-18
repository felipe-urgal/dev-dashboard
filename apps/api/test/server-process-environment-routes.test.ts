import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { ManagedProcess, Project } from '@dev-dashboard/contracts';

const TOKEN = 'e'.repeat(64);
const PROJECT_ID = 'p1';
const PRIMARY_ID = `environment:primary:${PROJECT_ID}`;
const WORKTREE_ID = `environment:worktree:${PROJECT_ID}:wt-1`;

test('rotas do servidor usam a Environment Instance correta', async (context) => {
  const root = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-server-environment-routes-'),
  );
  const projectPath = path.join(root, 'project');
  const worktreePath = path.join(root, 'worktree');
  await mkdir(projectPath, { recursive: true });
  await mkdir(worktreePath, { recursive: true });

  const previousConfigDirectory = process.env.DEV_DASHBOARD_CONFIG_DIR;
  const previousStateDirectory = process.env.DEV_DASHBOARD_STATE_DIR;
  process.env.DEV_DASHBOARD_CONFIG_DIR = path.join(root, 'config');
  process.env.DEV_DASHBOARD_STATE_DIR = path.join(root, 'state');

  const { buildApp } = await import('../src/app.js');
  const { createAppContext } = await import('../src/app-context.js');
  const appContext = createAppContext();

  const project: Project = {
    id: PROJECT_ID,
    name: 'sample',
    path: projectPath,
    type: 'node',
    source: 'workspace',
    workspaceId: 'w1',
    enabled: true,
    capabilities: ['server'],
  };
  appContext.projectStore.saveWorkspaceScan({
    workspaceId: 'w1',
    workspacePath: root,
    projects: [project],
    warnings: [],
  });
  appContext.developmentEnvironmentInstanceStore.reconcileWorktrees(PROJECT_ID, [
    { id: 'wt-1', path: worktreePath, kind: 'linked' },
  ]);

  const calls: Array<{ action: string; environmentInstanceId?: string }> = [];
  appContext.processManager.getServerProcess = async (
    _projectId,
    environmentInstanceId,
  ) => {
    calls.push({ action: 'status', environmentInstanceId });
    return null;
  };
  appContext.processManager.readServerLog = async (
    _projectId,
    _options,
    environmentInstanceId,
  ) => {
    calls.push({ action: 'read-log', environmentInstanceId });
    return {
      projectId: PROJECT_ID,
      processId: 'server',
      content: '',
      sizeBytes: 0,
      truncated: false,
      masked: false,
      redactionCount: 0,
      readAt: '2026-09-18T10:00:00.000Z',
    };
  };
  appContext.processManager.clearServerLog = async (
    _projectId,
    environmentInstanceId,
  ) => {
    calls.push({ action: 'clear-log', environmentInstanceId });
    return {
      projectId: PROJECT_ID,
      processId: 'server',
      content: '',
      sizeBytes: 0,
      truncated: false,
      masked: false,
      redactionCount: 0,
      readAt: '2026-09-18T10:00:00.000Z',
    };
  };
  appContext.processManager.stopServer = async (
    _projectId,
    environmentInstanceId,
  ) => {
    calls.push({ action: 'stop', environmentInstanceId });
    return {
      id: 'server',
      projectId: PROJECT_ID,
      ...(environmentInstanceId ? { environmentInstanceId } : {}),
      kind: 'server',
      status: 'stopped',
    } satisfies ManagedProcess;
  };

  const app = await buildApp({ localToken: TOKEN, context: appContext });
  context.after(async () => {
    await app.close();
    if (previousConfigDirectory === undefined)
      delete process.env.DEV_DASHBOARD_CONFIG_DIR;
    else process.env.DEV_DASHBOARD_CONFIG_DIR = previousConfigDirectory;
    if (previousStateDirectory === undefined)
      delete process.env.DEV_DASHBOARD_STATE_DIR;
    else process.env.DEV_DASHBOARD_STATE_DIR = previousStateDirectory;
    await rm(root, { recursive: true, force: true });
  });

  const headers = { 'x-dev-dashboard-token': TOKEN };

  const primaryStatus = await app.inject({
    method: 'GET',
    url: `/api/projects/${PROJECT_ID}/process`,
    headers,
  });
  assert.equal(primaryStatus.statusCode, 200);
  assert.deepEqual(calls.at(-1), {
    action: 'status',
    environmentInstanceId: PRIMARY_ID,
  });

  const worktreeQuery =
    `environmentInstanceId=${encodeURIComponent(WORKTREE_ID)}`;

  const worktreeStatus = await app.inject({
    method: 'GET',
    url: `/api/projects/${PROJECT_ID}/process?${worktreeQuery}`,
    headers,
  });
  assert.equal(worktreeStatus.statusCode, 200);
  assert.deepEqual(calls.at(-1), {
    action: 'status',
    environmentInstanceId: WORKTREE_ID,
  });

  const logs = await app.inject({
    method: 'GET',
    url: `/api/projects/${PROJECT_ID}/process/logs?maxBytes=1024&${worktreeQuery}`,
    headers,
  });
  assert.equal(logs.statusCode, 200);
  assert.deepEqual(calls.at(-1), {
    action: 'read-log',
    environmentInstanceId: WORKTREE_ID,
  });

  const clear = await app.inject({
    method: 'DELETE',
    url: `/api/projects/${PROJECT_ID}/process/logs?${worktreeQuery}`,
    headers,
  });
  assert.equal(clear.statusCode, 200);
  assert.deepEqual(calls.at(-1), {
    action: 'clear-log',
    environmentInstanceId: WORKTREE_ID,
  });

  const stop = await app.inject({
    method: 'POST',
    url: `/api/projects/${PROJECT_ID}/process/stop?${worktreeQuery}`,
    headers,
  });
  assert.equal(stop.statusCode, 200);
  assert.deepEqual(calls.at(-1), {
    action: 'stop',
    environmentInstanceId: WORKTREE_ID,
  });

  const invalid = await app.inject({
    method: 'GET',
    url:
      `/api/projects/${PROJECT_ID}/process?environmentInstanceId=` +
      encodeURIComponent(`environment:worktree:${PROJECT_ID}:missing`),
    headers,
  });
  assert.equal(invalid.statusCode, 404);
  assert.equal(invalid.json().error, 'ENVIRONMENT_INSTANCE_NOT_FOUND');
});
