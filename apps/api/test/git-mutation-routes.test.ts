import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

const execFileAsync = promisify(execFile);
const TOKEN = 'q'.repeat(64);

async function git(cwd: string, args: readonly string[]): Promise<void> {
  await execFileAsync('git', args as string[], { cwd });
}

interface ConfirmationResponse { confirmation: { token: string; operation: string; target: string; expiresAt: string } }
interface BranchResponse { branch: { branch: string } }
interface ErrorResponse { error?: string; message?: string }

test('rotas de mutação Git: confirmação, criação e troca de branch', async (context) => {
  const fixtureRoot = await mkdtemp(path.join(tmpdir(), 'dev-dashboard-git-routes-'));
  const repoPath = path.join(fixtureRoot, 'sample');
  await execFileAsync('git', ['init', '-q', '-b', 'main', repoPath]);
  await git(repoPath, ['config', 'user.email', 'dev@example.com']);
  await git(repoPath, ['config', 'user.name', 'Dev']);
  await writeFile(path.join(repoPath, 'README.md'), 'v1\n');
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
    id: 'p1', name: 'sample', path: repoPath, type: 'node',
    source: 'workspace', workspaceId: 'w1', favorite: false, capabilities: ['git'],
  };
  appContext.projectStore.saveWorkspaceScan({
    workspaceId: 'w1', workspacePath: fixtureRoot, projects: [project], warnings: [],
  });

  const app = await buildApp({ localToken: TOKEN, context: appContext });
  context.after(async () => {
    await app.close();
    if (previousConfigDirectory === undefined) delete process.env.DEV_DASHBOARD_CONFIG_DIR;
    else process.env.DEV_DASHBOARD_CONFIG_DIR = previousConfigDirectory;
    if (previousStateDirectory === undefined) delete process.env.DEV_DASHBOARD_STATE_DIR;
    else process.env.DEV_DASHBOARD_STATE_DIR = previousStateDirectory;
    await rm(fixtureRoot, { recursive: true, force: true });
  });

  const headers = { 'x-dev-dashboard-token': TOKEN, 'content-type': 'application/json' };

  await context.test('confirmar + criar branch retorna 201', async () => {
    const confirmationResponse = await app.inject({
      method: 'POST', url: '/api/projects/p1/git/mutations/confirmations', headers,
      payload: JSON.stringify({ operation: 'create-branch', target: 'feature/route' }),
    });
    assert.equal(confirmationResponse.statusCode, 201);
    const { confirmation } = confirmationResponse.json<ConfirmationResponse>();
    assert.equal(confirmation.operation, 'create-branch');
    assert.equal(confirmation.target, 'feature/route');
    assert.equal(confirmation.token.length, 64);

    const createResponse = await app.inject({
      method: 'POST', url: '/api/projects/p1/git/branches', headers,
      payload: JSON.stringify({ name: 'feature/route', confirmationToken: confirmation.token }),
    });
    assert.equal(createResponse.statusCode, 201);
    assert.equal(createResponse.json<BranchResponse>().branch.branch, 'feature/route');
  });

  await context.test('criar branch sem confirmação retorna 409 GIT_MUTATION_CONFIRMATION_REQUIRED', async () => {
    const response = await app.inject({
      method: 'POST', url: '/api/projects/p1/git/branches', headers,
      payload: JSON.stringify({ name: 'feature/no-token', confirmationToken: 'z'.repeat(64) }),
    });
    assert.equal(response.statusCode, 409);
    assert.equal(response.json<ErrorResponse>().error, 'GIT_MUTATION_CONFIRMATION_REQUIRED');
  });

  await context.test('trocar para branch inexistente retorna 404 GIT_BRANCH_NOT_FOUND', async () => {
    const confirmationResponse = await app.inject({
      method: 'POST', url: '/api/projects/p1/git/mutations/confirmations', headers,
      payload: JSON.stringify({ operation: 'switch-branch', target: 'no-such-branch' }),
    });
    const { confirmation } = confirmationResponse.json<ConfirmationResponse>();
    const response = await app.inject({
      method: 'POST', url: '/api/projects/p1/git/switch', headers,
      payload: JSON.stringify({ name: 'no-such-branch', confirmationToken: confirmation.token }),
    });
    assert.equal(response.statusCode, 404);
    assert.equal(response.json<ErrorResponse>().error, 'GIT_BRANCH_NOT_FOUND');
  });

  await context.test('rota rejeita projeto desconhecido com 404', async () => {
    const response = await app.inject({
      method: 'POST', url: '/api/projects/ghost/git/mutations/confirmations', headers,
      payload: JSON.stringify({ operation: 'create-branch', target: 'x' }),
    });
    assert.equal(response.statusCode, 404);
    assert.equal(response.json<ErrorResponse>().error, 'PROJECT_NOT_FOUND');
  });

  await context.test('rota exige autenticação', async () => {
    const response = await app.inject({
      method: 'POST', url: '/api/projects/p1/git/mutations/confirmations',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ operation: 'create-branch', target: 'x' }),
    });
    assert.equal(response.statusCode, 401);
  });

  await context.test('push em repositório sem remoto retorna 409 GIT_REMOTE_NOT_CONFIGURED', async () => {
    await git(repoPath, ['switch', 'main']);
    const confirmationResponse = await app.inject({
      method: 'POST', url: '/api/projects/p1/git/mutations/confirmations', headers,
      payload: JSON.stringify({ operation: 'push', target: 'main' }),
    });
    const { confirmation } = confirmationResponse.json<ConfirmationResponse>();
    const response = await app.inject({
      method: 'POST', url: '/api/projects/p1/git/push', headers,
      payload: JSON.stringify({ confirmationToken: confirmation.token }),
    });
    assert.equal(response.statusCode, 409);
    assert.equal(response.json<ErrorResponse>().error, 'GIT_REMOTE_NOT_CONFIGURED');
  });

  await context.test('pull sem upstream retorna 409 GIT_NO_UPSTREAM', async () => {
    const confirmationResponse = await app.inject({
      method: 'POST', url: '/api/projects/p1/git/mutations/confirmations', headers,
      payload: JSON.stringify({ operation: 'pull', target: 'main' }),
    });
    const { confirmation } = confirmationResponse.json<ConfirmationResponse>();
    const response = await app.inject({
      method: 'POST', url: '/api/projects/p1/git/pull', headers,
      payload: JSON.stringify({ confirmationToken: confirmation.token }),
    });
    assert.equal(response.statusCode, 409);
    assert.equal(response.json<ErrorResponse>().error, 'GIT_NO_UPSTREAM');
  });

  await context.test('pull/push sem confirmação retornam 409 GIT_MUTATION_CONFIRMATION_REQUIRED', async () => {
    const pullResponse = await app.inject({
      method: 'POST', url: '/api/projects/p1/git/pull', headers,
      payload: JSON.stringify({ confirmationToken: 'z'.repeat(64) }),
    });
    assert.equal(pullResponse.statusCode, 409);
    assert.equal(pullResponse.json<ErrorResponse>().error, 'GIT_MUTATION_CONFIRMATION_REQUIRED');

    const pushResponse = await app.inject({
      method: 'POST', url: '/api/projects/p1/git/push', headers,
      payload: JSON.stringify({ confirmationToken: 'z'.repeat(64) }),
    });
    assert.equal(pushResponse.statusCode, 409);
    assert.equal(pushResponse.json<ErrorResponse>().error, 'GIT_MUTATION_CONFIRMATION_REQUIRED');
  });

  await context.test('pull/push em projeto desconhecido retornam 404', async () => {
    const pullResponse = await app.inject({
      method: 'POST', url: '/api/projects/ghost/git/pull', headers,
      payload: JSON.stringify({ confirmationToken: 'z'.repeat(64) }),
    });
    assert.equal(pullResponse.statusCode, 404);
    assert.equal(pullResponse.json<ErrorResponse>().error, 'PROJECT_NOT_FOUND');

    const pushResponse = await app.inject({
      method: 'POST', url: '/api/projects/ghost/git/push', headers,
      payload: JSON.stringify({ confirmationToken: 'z'.repeat(64) }),
    });
    assert.equal(pushResponse.statusCode, 404);
    assert.equal(pushResponse.json<ErrorResponse>().error, 'PROJECT_NOT_FOUND');
  });

  await context.test('commit sem nada staged retorna 409 GIT_NOTHING_TO_COMMIT', async () => {
    const confirmationResponse = await app.inject({
      method: 'POST', url: '/api/projects/p1/git/mutations/confirmations', headers,
      payload: JSON.stringify({ operation: 'commit', target: 'main' }),
    });
    const { confirmation } = confirmationResponse.json<ConfirmationResponse>();
    const response = await app.inject({
      method: 'POST', url: '/api/projects/p1/git/commit', headers,
      payload: JSON.stringify({ message: 'nada staged', confirmationToken: confirmation.token }),
    });
    assert.equal(response.statusCode, 409);
    assert.equal(response.json<ErrorResponse>().error, 'GIT_NOTHING_TO_COMMIT');
  });

  await context.test('commit com alterações staged retorna 201', async () => {
    await writeFile(path.join(repoPath, 'README.md'), 'via rota\n');
    await git(repoPath, ['add', '.']);
    const confirmationResponse = await app.inject({
      method: 'POST', url: '/api/projects/p1/git/mutations/confirmations', headers,
      payload: JSON.stringify({ operation: 'commit', target: 'main' }),
    });
    const { confirmation } = confirmationResponse.json<ConfirmationResponse>();
    const response = await app.inject({
      method: 'POST', url: '/api/projects/p1/git/commit', headers,
      payload: JSON.stringify({ message: 'commit via rota', confirmationToken: confirmation.token }),
    });
    assert.equal(response.statusCode, 201);
    interface CommitResponse { commit: { hash: string; shortHash: string; subject: string } }
    assert.equal(response.json<CommitResponse>().commit.subject, 'commit via rota');
  });

  await context.test('stash: empilhar e restaurar via rota', async () => {
    await writeFile(path.join(repoPath, 'README.md'), 'stash via rota\n');

    const pushConfirmationResponse = await app.inject({
      method: 'POST', url: '/api/projects/p1/git/mutations/confirmations', headers,
      payload: JSON.stringify({ operation: 'stash-push', target: 'main' }),
    });
    const { confirmation: pushConfirmation } = pushConfirmationResponse.json<ConfirmationResponse>();
    const pushResponse = await app.inject({
      method: 'POST', url: '/api/projects/p1/git/stash', headers,
      payload: JSON.stringify({ confirmationToken: pushConfirmation.token }),
    });
    assert.equal(pushResponse.statusCode, 201);
    interface StashPushResponse { stash: { index: number; message: string; createdAt: string } }
    assert.equal(pushResponse.json<StashPushResponse>().stash.index, 0);

    const popConfirmationResponse = await app.inject({
      method: 'POST', url: '/api/projects/p1/git/mutations/confirmations', headers,
      payload: JSON.stringify({ operation: 'stash-pop', target: 'main' }),
    });
    const { confirmation: popConfirmation } = popConfirmationResponse.json<ConfirmationResponse>();
    const popResponse = await app.inject({
      method: 'POST', url: '/api/projects/p1/git/stash/pop', headers,
      payload: JSON.stringify({ confirmationToken: popConfirmation.token }),
    });
    assert.equal(popResponse.statusCode, 200);
    interface StashPopResponse { popped: { index: number; message: string; createdAt: string } }
    assert.equal(popResponse.json<StashPopResponse>().popped.index, 0);
  });

  await context.test('stash pop sem stash disponível retorna 404 GIT_STASH_EMPTY', async () => {
    const confirmationResponse = await app.inject({
      method: 'POST', url: '/api/projects/p1/git/mutations/confirmations', headers,
      payload: JSON.stringify({ operation: 'stash-pop', target: 'main' }),
    });
    const { confirmation } = confirmationResponse.json<ConfirmationResponse>();
    const response = await app.inject({
      method: 'POST', url: '/api/projects/p1/git/stash/pop', headers,
      payload: JSON.stringify({ confirmationToken: confirmation.token }),
    });
    assert.equal(response.statusCode, 404);
    assert.equal(response.json<ErrorResponse>().error, 'GIT_STASH_EMPTY');
  });
});
