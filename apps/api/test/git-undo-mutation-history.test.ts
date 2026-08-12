import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

const execFileAsync = promisify(execFile);
const TOKEN = 'u'.repeat(64);

async function git(cwd: string, args: readonly string[]): Promise<void> {
  await execFileAsync('git', args as string[], { cwd });
}

interface ConfirmationResponse {
  confirmation: {
    token: string;
    operation: string;
    target: string;
    expiresAt: string;
  };
}
interface ErrorResponse {
  error?: string;
  message?: string;
}
interface HistoryEvent {
  id: string;
  projectId: string;
  operationId: string;
  risk: string;
  result: 'succeeded' | 'failed';
  errorCode?: string;
}
interface HistoryResponse {
  total: number;
  events: HistoryEvent[];
}

/**
 * Verifica que `GitUndoService` (`undo-commit`/`undo-file`), migrado da task
 * 098, grava eventos no histórico compartilhado no mesmo padrão de
 * `git-mutation-history-routes.test.ts`.
 */
test('histórico de mutações Git: desfazer (undo-commit/undo-file)', async (context) => {
  const fixtureRoot = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-git-undo-history-'),
  );
  const repoPath = path.join(fixtureRoot, 'sample');
  await execFileAsync('git', ['init', '-q', '-b', 'main', repoPath]);
  await git(repoPath, ['config', 'user.email', 'dev@example.com']);
  await git(repoPath, ['config', 'user.name', 'Dev']);
  await writeFile(path.join(repoPath, 'README.md'), 'v1\n');
  await git(repoPath, ['add', '.']);
  await git(repoPath, ['commit', '-q', '-m', 'init']);
  await writeFile(path.join(repoPath, 'file.txt'), 'v1\n');
  await git(repoPath, ['add', '.']);
  await git(repoPath, ['commit', '-q', '-m', 'adiciona arquivo']);

  const previousStateDirectory = process.env.DEV_DASHBOARD_STATE_DIR;
  process.env.DEV_DASHBOARD_STATE_DIR = path.join(fixtureRoot, 'state');

  const { buildApp } = await import('../src/app.js');
  const { createAppContext } = await import('../src/app-context.js');
  const appContext = createAppContext();
  const project: Project = {
    id: 'p1',
    name: 'sample',
    path: repoPath,
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
    if (previousStateDirectory === undefined)
      delete process.env.DEV_DASHBOARD_STATE_DIR;
    else process.env.DEV_DASHBOARD_STATE_DIR = previousStateDirectory;
    await rm(fixtureRoot, { recursive: true, force: true });
  });

  const headers = {
    'x-dev-dashboard-token': TOKEN,
    'content-type': 'application/json',
  };

  await context.test('histórico começa vazio', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/projects/p1/git/mutation-history',
      headers,
    });
    assert.equal(response.json<HistoryResponse>().total, 0);
  });

  await context.test(
    'desfazer o último commit com sucesso é registrado com risco destructive',
    async () => {
      const confirmationResponse = await app.inject({
        method: 'POST',
        url: '/api/projects/p1/git/undo/confirmations',
        headers,
        payload: JSON.stringify({ operation: 'commit', target: 'main' }),
      });
      const { confirmation } =
        confirmationResponse.json<ConfirmationResponse>();
      const undoResponse = await app.inject({
        method: 'POST',
        url: '/api/projects/p1/git/undo/commit',
        headers,
        payload: JSON.stringify({ confirmationToken: confirmation.token }),
      });
      assert.equal(undoResponse.statusCode, 200);

      const historyResponse = await app.inject({
        method: 'GET',
        url: '/api/projects/p1/git/mutation-history',
        headers,
      });
      const body = historyResponse.json<HistoryResponse>();
      assert.equal(body.total, 1);
      assert.equal(body.events[0]!.operationId, 'undo-commit');
      assert.equal(body.events[0]!.result, 'succeeded');
      assert.equal(body.events[0]!.risk, 'destructive');
      assert.equal(JSON.stringify(body.events[0]).includes(repoPath), false);
    },
  );

  await context.test(
    'confirmação ausente/expirada não gera evento de histórico',
    async () => {
      const before = await app.inject({
        method: 'GET',
        url: '/api/projects/p1/git/mutation-history',
        headers,
      });
      const totalBefore = before.json<HistoryResponse>().total;

      const response = await app.inject({
        method: 'POST',
        url: '/api/projects/p1/git/undo/file',
        headers,
        payload: JSON.stringify({
          path: 'README.md',
          confirmationToken: 'z'.repeat(64),
        }),
      });
      assert.equal(response.statusCode, 409);
      assert.equal(
        response.json<ErrorResponse>().error,
        'GIT_MUTATION_CONFIRMATION_REQUIRED',
      );

      const after = await app.inject({
        method: 'GET',
        url: '/api/projects/p1/git/mutation-history',
        headers,
      });
      assert.equal(after.json<HistoryResponse>().total, totalBefore);
    },
  );

  await context.test(
    'falha controlada (arquivo sem alterações) é registrada com o código de erro',
    async () => {
      const confirmationResponse = await app.inject({
        method: 'POST',
        url: '/api/projects/p1/git/undo/confirmations',
        headers,
        payload: JSON.stringify({ operation: 'file', target: 'README.md' }),
      });
      const { confirmation } =
        confirmationResponse.json<ConfirmationResponse>();
      const response = await app.inject({
        method: 'POST',
        url: '/api/projects/p1/git/undo/file',
        headers,
        payload: JSON.stringify({
          path: 'README.md',
          confirmationToken: confirmation.token,
        }),
      });
      assert.equal(response.statusCode, 404);
      assert.equal(response.json<ErrorResponse>().error, 'GIT_FILE_NOT_FOUND');

      const historyResponse = await app.inject({
        method: 'GET',
        url: '/api/projects/p1/git/mutation-history',
        headers,
      });
      const body = historyResponse.json<HistoryResponse>();
      const failure = body.events.find(
        (event) => event.operationId === 'undo-file',
      );
      assert.ok(failure);
      assert.equal(failure!.result, 'failed');
      assert.equal(failure!.errorCode, 'GIT_FILE_NOT_FOUND');
    },
  );
});
