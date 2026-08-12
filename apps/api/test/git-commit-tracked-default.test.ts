import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

const execFileAsync = promisify(execFile);
const TOKEN = 'c'.repeat(64);

async function git(cwd: string, args: readonly string[]): Promise<void> {
  await execFileAsync('git', args as string[], { cwd });
}

test('novo commit inclui alterações rastreadas mesmo com flag legada false', async (context) => {
  const fixtureRoot = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-commit-tracked-'),
  );
  const repoPath = path.join(fixtureRoot, 'sample');
  await execFileAsync('git', ['init', '-q', '-b', 'main', repoPath]);
  await git(repoPath, ['config', 'user.email', 'dev@example.com']);
  await git(repoPath, ['config', 'user.name', 'Dev']);
  await writeFile(path.join(repoPath, 'README.md'), 'inicial\n');
  await git(repoPath, ['add', '.']);
  await git(repoPath, ['commit', '-q', '-m', 'init']);

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
    path: repoPath,
    type: 'node',
    source: 'workspace',
    workspaceId: 'w1',
    enabled: true,
    capabilities: ['git'],
  };
  appContext.projectStore.saveWorkspaceScan({
    workspaceId: 'w1',
    workspacePath: fixtureRoot,
    projects: [project],
    warnings: [],
  });

  const app = await buildApp({ localToken: TOKEN, context: appContext });
  context.after(async () => {
    await app.close();
    if (previousConfigDirectory === undefined) {
      delete process.env.DEV_DASHBOARD_CONFIG_DIR;
    } else {
      process.env.DEV_DASHBOARD_CONFIG_DIR = previousConfigDirectory;
    }
    if (previousStateDirectory === undefined) {
      delete process.env.DEV_DASHBOARD_STATE_DIR;
    } else {
      process.env.DEV_DASHBOARD_STATE_DIR = previousStateDirectory;
    }
    await rm(fixtureRoot, { recursive: true, force: true });
  });

  await writeFile(path.join(repoPath, 'README.md'), 'sem stage manual\n');

  const headers = {
    'x-dev-dashboard-token': TOKEN,
    'content-type': 'application/json',
  };
  const confirmationResponse = await app.inject({
    method: 'POST',
    url: '/api/projects/p1/git/mutations/confirmations',
    headers,
    payload: JSON.stringify({ operation: 'commit', target: 'main' }),
  });
  const confirmation = confirmationResponse.json<{
    confirmation: { token: string };
  }>().confirmation;

  const response = await app.inject({
    method: 'POST',
    url: '/api/projects/p1/git/commit',
    headers,
    payload: JSON.stringify({
      message: 'commit sem stage manual',
      includeAllChanges: false,
      confirmationToken: confirmation.token,
    }),
  });

  assert.equal(response.statusCode, 201);
  assert.equal(
    response.json<{ commit: { subject: string } }>().commit.subject,
    'commit sem stage manual',
  );
  const { stdout } = await execFileAsync('git', ['show', 'HEAD:README.md'], {
    cwd: repoPath,
  });
  assert.equal(stdout, 'sem stage manual\n');
});
