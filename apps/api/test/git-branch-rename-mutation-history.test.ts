import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

const execFileAsync = promisify(execFile);
const TOKEN = 'r'.repeat(64);

async function git(cwd: string, args: readonly string[]): Promise<void> {
  await execFileAsync('git', args as string[], { cwd });
}

interface ConfirmationResponse {
  confirmation: {
    token: string;
    operation: string;
    currentName: string;
    nextName: string;
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
 * Verifica que `GitBranchRenameService` (`branch-rename`), migrado da task
 * 098, grava eventos no histórico compartilhado no mesmo padrão de
 * `git-mutation-history-routes.test.ts`.
 */
test('histórico de mutações Git: renomear branch (branch-rename)', async (context) => {
  const fixtureRoot = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-git-rename-history-'),
  );
  const repoPath = path.join(fixtureRoot, 'sample');
  await execFileAsync('git', ['init', '-q', '-b', 'main', repoPath]);
  await git(repoPath, ['config', 'user.email', 'dev@example.com']);
  await git(repoPath, ['config', 'user.name', 'Dev']);
  await writeFile(path.join(repoPath, 'README.md'), 'v1\n');
  await git(repoPath, ['add', '.']);
  await git(repoPath, ['commit', '-q', '-m', 'init']);
  await git(repoPath, ['branch', 'feature/old']);

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
    favorite: false,
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
    'renomear com sucesso é registrado com risco write-safe',
    async () => {
      const confirmationResponse = await app.inject({
        method: 'POST',
        url: '/api/projects/p1/git/branches/rename/confirmations',
        headers,
        payload: JSON.stringify({
          currentName: 'feature/old',
          nextName: 'feature/new',
        }),
      });
      const { confirmation } =
        confirmationResponse.json<ConfirmationResponse>();
      const renameResponse = await app.inject({
        method: 'POST',
        url: '/api/projects/p1/git/branches/rename',
        headers,
        payload: JSON.stringify({
          currentName: 'feature/old',
          nextName: 'feature/new',
          confirmationToken: confirmation.token,
        }),
      });
      assert.equal(renameResponse.statusCode, 200);

      const historyResponse = await app.inject({
        method: 'GET',
        url: '/api/projects/p1/git/mutation-history',
        headers,
      });
      const body = historyResponse.json<HistoryResponse>();
      assert.equal(body.total, 1);
      assert.equal(body.events[0]!.operationId, 'branch-rename');
      assert.equal(body.events[0]!.result, 'succeeded');
      assert.equal(body.events[0]!.risk, 'write-safe');
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
        url: '/api/projects/p1/git/branches/rename',
        headers,
        payload: JSON.stringify({
          currentName: 'feature/new',
          nextName: 'feature/other',
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
    'falha controlada (branch inexistente) é registrada com o código de erro',
    async () => {
      const confirmationResponse = await app.inject({
        method: 'POST',
        url: '/api/projects/p1/git/branches/rename/confirmations',
        headers,
        payload: JSON.stringify({
          currentName: 'no-such-branch',
          nextName: 'renamed',
        }),
      });
      const { confirmation } =
        confirmationResponse.json<ConfirmationResponse>();
      const response = await app.inject({
        method: 'POST',
        url: '/api/projects/p1/git/branches/rename',
        headers,
        payload: JSON.stringify({
          currentName: 'no-such-branch',
          nextName: 'renamed',
          confirmationToken: confirmation.token,
        }),
      });
      assert.equal(response.statusCode, 404);
      assert.equal(
        response.json<ErrorResponse>().error,
        'GIT_BRANCH_NOT_FOUND',
      );

      const historyResponse = await app.inject({
        method: 'GET',
        url: '/api/projects/p1/git/mutation-history',
        headers,
      });
      const body = historyResponse.json<HistoryResponse>();
      const failure = body.events.find(
        (event) => event.errorCode === 'GIT_BRANCH_NOT_FOUND',
      );
      assert.ok(failure);
      assert.equal(failure!.operationId, 'branch-rename');
      assert.equal(failure!.result, 'failed');
    },
  );
});
