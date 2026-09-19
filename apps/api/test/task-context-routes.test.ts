import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

import type {
  Project,
  TaskContext,
  TaskContextSnapshot,
} from '@dev-dashboard/contracts';

const execFileAsync = promisify(execFile);
const TOKEN = 't'.repeat(64);

async function git(cwd: string, args: readonly string[]): Promise<void> {
  await execFileAsync('git', args as string[], { cwd });
}

test('Task Context HTTP associa contexto local sem aceitar autoridade de path/branch', async (context) => {
  const fixtureRoot = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-task-context-http-'),
  );
  const projectPath = path.join(fixtureRoot, 'project');
  await execFileAsync('git', ['init', '-q', '-b', 'main', projectPath]);
  await git(projectPath, ['config', 'user.email', 'dev@example.com']);
  await git(projectPath, ['config', 'user.name', 'Dev']);
  await writeFile(path.join(projectPath, 'README.md'), 'fixture\n');
  await git(projectPath, ['add', '.']);
  await git(projectPath, ['commit', '-q', '-m', 'initial']);

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
    capabilities: ['git'],
  };
  appContext.projectStore.saveWorkspaceScan({
    workspaceId: 'workspace-a',
    workspacePath: fixtureRoot,
    projects: [project],
    warnings: [],
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
    url: '/api/projects/project-a/task-contexts',
  });
  assert.equal(unauthorized.statusCode, 401);

  const headers = {
    'x-dev-dashboard-token': TOKEN,
    'content-type': 'application/json',
  };

  const createdResponse = await app.inject({
    method: 'POST',
    url: '/api/projects/project-a/task-contexts',
    headers,
    payload: {
      issue: {
        repository: 'felipe-urgal/dev-dashboard',
        number: 599,
      },
    },
  });
  assert.equal(createdResponse.statusCode, 201);
  const created = createdResponse.json<{ context: TaskContext }>().context;
  assert.equal(created.branch, 'main');
  assert.equal(created.projectId, project.id);
  assert.equal(
    created.environmentInstanceId,
    `environment:primary:${project.id}`,
  );
  assert.equal(created.issue?.number, 599);

  const listResponse = await app.inject({
    method: 'GET',
    url: '/api/projects/project-a/task-contexts',
    headers,
  });
  assert.equal(listResponse.statusCode, 200);
  assert.equal(
    listResponse.json<{ contexts: TaskContext[] }>().contexts.length,
    1,
  );

  const snapshotResponse = await app.inject({
    method: 'GET',
    url: `/api/projects/project-a/task-contexts/${created.id}`,
    headers,
  });
  assert.equal(snapshotResponse.statusCode, 200);
  const snapshot = snapshotResponse.json<{ snapshot: TaskContextSnapshot }>()
    .snapshot;
  assert.equal(snapshot.context.id, created.id);
  assert.equal(snapshot.evidence?.currentBranch, 'main');
  assert.equal(snapshot.evidence?.branchMatches, true);
  assert.match(snapshot.evidence?.headSha ?? '', /^[0-9a-f]{40}$/);

  const updatedResponse = await app.inject({
    method: 'PATCH',
    url: `/api/projects/project-a/task-contexts/${created.id}`,
    headers,
    payload: {
      pullRequest: {
        repository: 'felipe-urgal/dev-dashboard',
        number: 784,
      },
    },
  });
  assert.equal(updatedResponse.statusCode, 200);
  const updated = updatedResponse.json<{ context: TaskContext }>().context;
  assert.equal(updated.pullRequest?.number, 784);
  assert.equal(updated.branch, 'main');

  const invalidReference = await app.inject({
    method: 'PATCH',
    url: `/api/projects/project-a/task-contexts/${created.id}`,
    headers,
    payload: {
      issue: {
        repository: 'felipe-urgal/dev-dashboard',
        number: 0,
      },
    },
  });
  assert.equal(invalidReference.statusCode, 400);

  const missingEnvironment = await app.inject({
    method: 'POST',
    url: '/api/projects/project-a/task-contexts',
    headers,
    payload: { environmentInstanceId: 'environment:missing' },
  });
  assert.equal(missingEnvironment.statusCode, 404);
  assert.equal(
    missingEnvironment.json<{ error: string }>().error,
    'ENVIRONMENT_INSTANCE_NOT_FOUND',
  );

  const serialized = JSON.stringify(snapshot);
  assert.equal(serialized.includes(projectPath), false);

  const removed = await app.inject({
    method: 'DELETE',
    url: `/api/projects/project-a/task-contexts/${created.id}`,
    headers: { 'x-dev-dashboard-token': TOKEN },
  });
  assert.equal(removed.statusCode, 200);
  assert.equal(removed.json<{ removed: boolean }>().removed, true);

  const missing = await app.inject({
    method: 'GET',
    url: `/api/projects/project-a/task-contexts/${created.id}`,
    headers,
  });
  assert.equal(missing.statusCode, 404);
  assert.equal(missing.json<{ error: string }>().error, 'NOT_FOUND');
});
