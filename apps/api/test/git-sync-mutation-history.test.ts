import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

const execFileAsync = promisify(execFile);
const TOKEN = 's'.repeat(64);

async function git(cwd: string, args: readonly string[]): Promise<void> {
  await execFileAsync('git', args as string[], { cwd });
}

interface ConfirmationResponse {
  confirmation: { token: string; reference: string; strategy: string; expiresAt: string };
}
interface ErrorResponse { error?: string; message?: string }
interface HistoryEvent {
  id: string;
  projectId: string;
  operationId: string;
  risk: string;
  result: 'succeeded' | 'failed';
  errorCode?: string;
}
interface HistoryResponse { total: number; events: HistoryEvent[] }

/**
 * Verifica que `GitSyncService` (`sync-integrate`/`sync-main`), migrado da
 * task 098 para o mecanismo compartilhado de confirmação e histórico, grava
 * eventos no mesmo padrão de `git-mutation-history-routes.test.ts`.
 */
test('histórico de mutações Git: sincronização (sync-integrate/sync-main)', async (context) => {
  const fixtureRoot = await mkdtemp(path.join(tmpdir(), 'dev-dashboard-git-sync-history-'));
  const upstream = path.join(fixtureRoot, 'upstream.git');
  const origin = path.join(fixtureRoot, 'origin.git');
  const local = path.join(fixtureRoot, 'local');
  const source = path.join(fixtureRoot, 'source');

  await git(fixtureRoot, ['init', '--bare', '--initial-branch=main', upstream]);
  await git(fixtureRoot, ['init', '--bare', '--initial-branch=main', origin]);
  await git(fixtureRoot, ['init', '--initial-branch=main', local]);
  await git(local, ['config', 'user.name', 'Dashboard Test']);
  await git(local, ['config', 'user.email', 'dashboard@example.test']);
  await writeFile(path.join(local, 'README.md'), '# Projeto\n');
  await git(local, ['add', 'README.md']);
  await git(local, ['commit', '-m', 'initial']);
  await git(local, ['remote', 'add', 'upstream', upstream]);
  await git(local, ['remote', 'add', 'origin', origin]);
  await git(local, ['push', '--set-upstream', 'upstream', 'main']);
  await git(local, ['push', '--set-upstream', 'origin', 'main']);

  await git(fixtureRoot, ['clone', upstream, source]);
  await git(source, ['config', 'user.name', 'Upstream Test']);
  await git(source, ['config', 'user.email', 'upstream@example.test']);
  await writeFile(path.join(source, 'upstream.txt'), 'nova versão\n');
  await git(source, ['add', 'upstream.txt']);
  await git(source, ['commit', '-m', 'feat: atualiza upstream']);
  await git(source, ['push', 'origin', 'main']);
  await git(local, ['fetch', 'upstream']);

  const previousStateDirectory = process.env.DEV_DASHBOARD_STATE_DIR;
  process.env.DEV_DASHBOARD_STATE_DIR = path.join(fixtureRoot, 'state');

  const { buildApp } = await import('../src/app.js');
  const { createAppContext } = await import('../src/app-context.js');
  const appContext = createAppContext();
  const project: Project = {
    id: 'p1', name: 'local', path: local,
    source: 'workspace', workspaceId: 'w1', favorite: false, capabilities: ['git'],
  };
  appContext.projectStore.saveWorkspaceScan({
    workspaceId: 'w1', workspacePath: fixtureRoot, projects: [project], warnings: [],
  });

  const app = await buildApp({ localToken: TOKEN, context: appContext });
  context.after(async () => {
    await app.close();
    if (previousStateDirectory === undefined) delete process.env.DEV_DASHBOARD_STATE_DIR;
    else process.env.DEV_DASHBOARD_STATE_DIR = previousStateDirectory;
    await rm(fixtureRoot, { recursive: true, force: true });
  });

  const headers = { 'x-dev-dashboard-token': TOKEN, 'content-type': 'application/json' };

  await context.test('histórico começa vazio', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/projects/p1/git/mutation-history', headers });
    assert.equal(response.json<HistoryResponse>().total, 0);
  });

  await context.test('integração bem-sucedida é registrada como sync-integrate com risco write-remote', async () => {
    const confirmationResponse = await app.inject({
      method: 'POST', url: '/api/projects/p1/git/sync/confirmations', headers,
      payload: JSON.stringify({ reference: 'upstream/main', strategy: 'ff-only' }),
    });
    const { confirmation } = confirmationResponse.json<ConfirmationResponse>();
    const syncResponse = await app.inject({
      method: 'POST', url: '/api/projects/p1/git/sync', headers,
      payload: JSON.stringify({ reference: 'upstream/main', strategy: 'ff-only', confirmationToken: confirmation.token }),
    });
    assert.equal(syncResponse.statusCode, 200);

    const historyResponse = await app.inject({ method: 'GET', url: '/api/projects/p1/git/mutation-history', headers });
    const body = historyResponse.json<HistoryResponse>();
    assert.equal(body.total, 1);
    assert.equal(body.events[0]!.operationId, 'sync-integrate');
    assert.equal(body.events[0]!.result, 'succeeded');
    assert.equal(body.events[0]!.risk, 'write-remote');
    assert.equal(JSON.stringify(body.events[0]).includes(local), false);
  });

  await context.test('confirmação ausente não gera evento de histórico', async () => {
    const before = await app.inject({ method: 'GET', url: '/api/projects/p1/git/mutation-history', headers });
    const totalBefore = before.json<HistoryResponse>().total;

    const response = await app.inject({
      method: 'POST', url: '/api/projects/p1/git/sync', headers,
      payload: JSON.stringify({ reference: 'upstream/main', strategy: 'ff-only', confirmationToken: 'z'.repeat(64) }),
    });
    assert.equal(response.statusCode, 409);
    assert.equal(response.json<ErrorResponse>().error, 'GIT_SYNC_CONFIRMATION_REQUIRED');

    const after = await app.inject({ method: 'GET', url: '/api/projects/p1/git/mutation-history', headers });
    assert.equal(after.json<HistoryResponse>().total, totalBefore);
  });

  await context.test('falha controlada na sincronização é registrada com o código de erro', async () => {
    const confirmationResponse = await app.inject({
      method: 'POST', url: '/api/projects/p1/git/sync/confirmations', headers,
      payload: JSON.stringify({ reference: 'upstream/no-such-branch', strategy: 'ff-only' }),
    });
    const { confirmation } = confirmationResponse.json<ConfirmationResponse>();
    const response = await app.inject({
      method: 'POST', url: '/api/projects/p1/git/sync', headers,
      payload: JSON.stringify({ reference: 'upstream/no-such-branch', strategy: 'ff-only', confirmationToken: confirmation.token }),
    });
    assert.equal(response.statusCode, 404);
    assert.equal(response.json<ErrorResponse>().error, 'GIT_REFERENCE_NOT_FOUND');

    const historyResponse = await app.inject({ method: 'GET', url: '/api/projects/p1/git/mutation-history', headers });
    const body = historyResponse.json<HistoryResponse>();
    const failure = body.events.find((event) => event.errorCode === 'GIT_REFERENCE_NOT_FOUND');
    assert.ok(failure);
    assert.equal(failure!.operationId, 'sync-integrate');
    assert.equal(failure!.result, 'failed');
  });

  await context.test('sincronização da main é registrada como sync-main', async () => {
    await writeFile(path.join(source, 'upstream-2.txt'), 'outra versão\n');
    await git(source, ['add', 'upstream-2.txt']);
    await git(source, ['commit', '-m', 'feat: nova atualização']);
    await git(source, ['push', 'origin', 'main']);

    const confirmationResponse = await app.inject({
      method: 'POST', url: '/api/projects/p1/git/sync/main/confirmations',
      headers: { 'x-dev-dashboard-token': TOKEN },
    });
    const { confirmation } = confirmationResponse.json<ConfirmationResponse>();
    const response = await app.inject({
      method: 'POST', url: '/api/projects/p1/git/sync/main', headers,
      payload: JSON.stringify({ confirmationToken: confirmation.token }),
    });
    assert.equal(response.statusCode, 200);

    const historyResponse = await app.inject({ method: 'GET', url: '/api/projects/p1/git/mutation-history', headers });
    const body = historyResponse.json<HistoryResponse>();
    const success = body.events.find((event) => event.operationId === 'sync-main');
    assert.ok(success);
    assert.equal(success!.result, 'succeeded');
    assert.equal(success!.risk, 'write-remote');
  });
});
