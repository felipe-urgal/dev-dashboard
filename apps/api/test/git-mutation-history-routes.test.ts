import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

const execFileAsync = promisify(execFile);
const TOKEN = 'h'.repeat(64);

async function git(cwd: string, args: readonly string[]): Promise<void> {
  await execFileAsync('git', args as string[], { cwd });
}

interface ConfirmationResponse { confirmation: { token: string; operation: string; target: string; expiresAt: string } }
interface ErrorResponse { error?: string; message?: string }
interface HistoryEvent {
  id: string;
  projectId: string;
  workspaceId?: string;
  operationId: string;
  risk: string;
  occurredAt: string;
  result: 'succeeded' | 'failed';
  errorCode?: string;
}
interface HistoryResponse {
  projectId: string;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  events: HistoryEvent[];
}

test('histórico de mutações Git: gravação por operação, paginação e autenticação', async (context) => {
  const fixtureRoot = await mkdtemp(path.join(tmpdir(), 'dev-dashboard-git-mutation-history-routes-'));
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

  await context.test('histórico começa vazio', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/projects/p1/git/mutation-history', headers });
    assert.equal(response.statusCode, 200);
    const body = response.json<HistoryResponse>();
    assert.equal(body.total, 0);
    assert.equal(body.events.length, 0);
  });

  await context.test('criar branch com sucesso é registrada no histórico com risco do catálogo', async () => {
    const confirmationResponse = await app.inject({
      method: 'POST', url: '/api/projects/p1/git/mutations/confirmations', headers,
      payload: JSON.stringify({ operation: 'create-branch', target: 'feature/history' }),
    });
    const { confirmation } = confirmationResponse.json<ConfirmationResponse>();
    const createResponse = await app.inject({
      method: 'POST', url: '/api/projects/p1/git/branches', headers,
      payload: JSON.stringify({ name: 'feature/history', confirmationToken: confirmation.token }),
    });
    assert.equal(createResponse.statusCode, 201);

    const historyResponse = await app.inject({ method: 'GET', url: '/api/projects/p1/git/mutation-history', headers });
    const body = historyResponse.json<HistoryResponse>();
    assert.equal(body.total, 1);
    assert.equal(body.events[0]!.operationId, 'create-branch');
    assert.equal(body.events[0]!.result, 'succeeded');
    assert.equal(body.events[0]!.risk, 'write-safe');
    assert.equal(body.events[0]!.workspaceId, 'w1');
    assert.equal(JSON.stringify(body.events[0]).includes(repoPath), false);
  });

  await context.test('confirmação ausente/expirada não gera evento de histórico', async () => {
    const before = await app.inject({ method: 'GET', url: '/api/projects/p1/git/mutation-history', headers });
    const totalBefore = before.json<HistoryResponse>().total;

    const response = await app.inject({
      method: 'POST', url: '/api/projects/p1/git/branches', headers,
      payload: JSON.stringify({ name: 'feature/sem-confirmacao', confirmationToken: 'z'.repeat(64) }),
    });
    assert.equal(response.statusCode, 409);
    assert.equal(response.json<ErrorResponse>().error, 'GIT_MUTATION_CONFIRMATION_REQUIRED');

    const after = await app.inject({ method: 'GET', url: '/api/projects/p1/git/mutation-history', headers });
    assert.equal(after.json<HistoryResponse>().total, totalBefore);
  });

  await context.test('falha controlada na execução é registrada com o código de erro', async () => {
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

    const historyResponse = await app.inject({ method: 'GET', url: '/api/projects/p1/git/mutation-history', headers });
    const body = historyResponse.json<HistoryResponse>();
    const failure = body.events.find((event) => event.operationId === 'switch-branch');
    assert.ok(failure);
    assert.equal(failure!.result, 'failed');
    assert.equal(failure!.errorCode, 'GIT_BRANCH_NOT_FOUND');
  });

  await context.test('paginação respeita page/pageSize e ordena do mais recente', async () => {
    for (let index = 0; index < 3; index += 1) {
      const confirmationResponse = await app.inject({
        method: 'POST', url: '/api/projects/p1/git/mutations/confirmations', headers,
        payload: JSON.stringify({ operation: 'switch-branch', target: 'main' }),
      });
      const { confirmation } = confirmationResponse.json<ConfirmationResponse>();
      // eslint-disable-next-line no-await-in-loop
      await app.inject({
        method: 'POST', url: '/api/projects/p1/git/switch', headers,
        payload: JSON.stringify({ name: 'main', confirmationToken: confirmation.token }),
      });
    }

    const pageOne = await app.inject({ method: 'GET', url: '/api/projects/p1/git/mutation-history?page=1&pageSize=2', headers });
    const bodyOne = pageOne.json<HistoryResponse>();
    assert.equal(bodyOne.pageSize, 2);
    assert.equal(bodyOne.events.length, 2);
    assert.ok(bodyOne.total >= 5);
  });

  await context.test('rota exige autenticação', async () => {
    const response = await app.inject({
      method: 'GET', url: '/api/projects/p1/git/mutation-history',
    });
    assert.equal(response.statusCode, 401);
  });

  await context.test('rota rejeita projeto desconhecido com 404', async () => {
    const response = await app.inject({
      method: 'GET', url: '/api/projects/ghost/git/mutation-history', headers,
    });
    assert.equal(response.statusCode, 404);
    assert.equal(response.json<ErrorResponse>().error, 'PROJECT_NOT_FOUND');
  });
});
