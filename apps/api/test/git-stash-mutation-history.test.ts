import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

const execFileAsync = promisify(execFile);
const TOKEN = 't'.repeat(64);

async function git(cwd: string, args: readonly string[]): Promise<string> {
  const result = await execFileAsync('git', args as string[], { cwd });
  return result.stdout.trim();
}

interface ConfirmationResponse {
  confirmation: { token: string; operation: string; target: string; expiresAt: string };
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
 * Verifica que `GitStashService` (`panel-stash-create/apply/pop/drop`),
 * migrado da task 098, grava eventos no histórico compartilhado no mesmo
 * padrão de `git-mutation-history-routes.test.ts`. Nenhum evento deve conter
 * o caminho absoluto do projeto ou o patch do stash.
 */
test('histórico de mutações Git: painel de stash (panel-stash-*)', async (context) => {
  const fixtureRoot = await mkdtemp(path.join(tmpdir(), 'dev-dashboard-git-stash-history-'));
  const repoPath = path.join(fixtureRoot, 'sample');
  await execFileAsync('git', ['init', '-q', '-b', 'main', repoPath]);
  await git(repoPath, ['config', 'user.email', 'dev@example.com']);
  await git(repoPath, ['config', 'user.name', 'Dev']);
  await writeFile(path.join(repoPath, 'README.md'), 'v1\n');
  await git(repoPath, ['add', '.']);
  await git(repoPath, ['commit', '-q', '-m', 'init']);

  const previousStateDirectory = process.env.DEV_DASHBOARD_STATE_DIR;
  process.env.DEV_DASHBOARD_STATE_DIR = path.join(fixtureRoot, 'state');

  const { buildApp } = await import('../src/app.js');
  const { createAppContext } = await import('../src/app-context.js');
  const appContext = createAppContext();
  const project: Project = {
    id: 'p1', name: 'sample', path: repoPath,
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

  await writeFile(path.join(repoPath, 'README.md'), 'v2\n');
  const branch = await git(repoPath, ['branch', '--show-current']);

  await context.test('criar stash com sucesso é registrado como panel-stash-create', async () => {
    const confirmationResponse = await app.inject({
      method: 'POST', url: '/api/projects/p1/git/stashes/confirmations', headers,
      payload: JSON.stringify({ operation: 'create', target: branch }),
    });
    const { confirmation } = confirmationResponse.json<ConfirmationResponse>();
    const createResponse = await app.inject({
      method: 'POST', url: '/api/projects/p1/git/stashes', headers,
      payload: JSON.stringify({ message: '', includeUntracked: false, keepIndex: false, confirmationToken: confirmation.token }),
    });
    assert.equal(createResponse.statusCode, 201);

    const historyResponse = await app.inject({ method: 'GET', url: '/api/projects/p1/git/mutation-history', headers });
    const body = historyResponse.json<HistoryResponse>();
    assert.equal(body.total, 1);
    assert.equal(body.events[0]!.operationId, 'panel-stash-create');
    assert.equal(body.events[0]!.result, 'succeeded');
    assert.equal(body.events[0]!.risk, 'write-safe');
    assert.equal(JSON.stringify(body.events[0]).includes(repoPath), false);
    assert.equal(JSON.stringify(body.events[0]).includes('README'), false);
  });

  await context.test('restaurar (pop) com sucesso é registrado como panel-stash-pop', async () => {
    const confirmationResponse = await app.inject({
      method: 'POST', url: '/api/projects/p1/git/stashes/confirmations', headers,
      payload: JSON.stringify({ operation: 'pop', target: 'stash@{0}' }),
    });
    const { confirmation } = confirmationResponse.json<ConfirmationResponse>();
    const popResponse = await app.inject({
      method: 'POST', url: '/api/projects/p1/git/stashes/stash@%7B0%7D/pop', headers,
      payload: JSON.stringify({ confirmationToken: confirmation.token }),
    });
    assert.equal(popResponse.statusCode, 200);

    const historyResponse = await app.inject({ method: 'GET', url: '/api/projects/p1/git/mutation-history', headers });
    const body = historyResponse.json<HistoryResponse>();
    const success = body.events.find((event) => event.operationId === 'panel-stash-pop');
    assert.ok(success);
    assert.equal(success!.result, 'succeeded');
    assert.equal(success!.risk, 'write-safe');
  });

  await context.test('confirmação ausente/expirada não gera evento de histórico', async () => {
    const before = await app.inject({ method: 'GET', url: '/api/projects/p1/git/mutation-history', headers });
    const totalBefore = before.json<HistoryResponse>().total;

    const response = await app.inject({
      method: 'POST', url: '/api/projects/p1/git/stashes/stash@%7B0%7D/drop', headers,
      payload: JSON.stringify({ confirmationToken: 'z'.repeat(64) }),
    });
    assert.equal(response.statusCode, 409);
    assert.equal(response.json<ErrorResponse>().error, 'GIT_MUTATION_CONFIRMATION_REQUIRED');

    const after = await app.inject({ method: 'GET', url: '/api/projects/p1/git/mutation-history', headers });
    assert.equal(after.json<HistoryResponse>().total, totalBefore);
  });

  await context.test('falha controlada (stash inexistente) é registrada com o código de erro', async () => {
    const confirmationResponse = await app.inject({
      method: 'POST', url: '/api/projects/p1/git/stashes/confirmations', headers,
      payload: JSON.stringify({ operation: 'drop', target: 'stash@{5}' }),
    });
    const { confirmation } = confirmationResponse.json<ConfirmationResponse>();
    const response = await app.inject({
      method: 'POST', url: '/api/projects/p1/git/stashes/stash@%7B5%7D/drop', headers,
      payload: JSON.stringify({ confirmationToken: confirmation.token }),
    });
    assert.equal(response.statusCode, 404);
    // A resposta HTTP usa o código já traduzido pela camada de rota
    // (`translateStashError`); o histórico grava o código bruto do serviço
    // (`GitStashError.code`), como já acontecia para os demais serviços
    // migrados — os dois só coincidem quando o serviço usa o mesmo
    // vocabulário nos dois níveis (caso de `GitService`).
    assert.equal(response.json<ErrorResponse>().error, 'GIT_REFERENCE_NOT_FOUND');

    const historyResponse = await app.inject({ method: 'GET', url: '/api/projects/p1/git/mutation-history', headers });
    const body = historyResponse.json<HistoryResponse>();
    const failure = body.events.find((event) => event.operationId === 'panel-stash-drop');
    assert.ok(failure);
    assert.equal(failure!.result, 'failed');
    assert.equal(failure!.errorCode, 'GIT_STASH_NOT_FOUND');
  });
});
