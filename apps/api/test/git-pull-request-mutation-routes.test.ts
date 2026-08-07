import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

const execFileAsync = promisify(execFile);
const TOKEN = 'g'.repeat(64);

async function git(cwd: string, args: readonly string[]): Promise<void> {
  await execFileAsync('git', args as string[], { cwd });
}

interface ConfirmationResponse {
  confirmation: { token: string; actionId: string; expiresAt: string };
}
interface ResultResponse {
  result: {
    action: string;
    number: number;
    url: string;
    title: string;
    state: string;
  };
}
interface ErrorResponse {
  error?: string;
  message?: string;
}
interface HistoryResponse {
  total: number;
  events: Array<{ operationId: string; result: string; risk: string }>;
}

const FAKE_GH_SCRIPT = `#!/usr/bin/env bash
set -euo pipefail
case "$1 $2" in
  "pr create")
    echo "https://github.com/felipe-urgal/dev-dashboard/pull/7"
    ;;
  "pr view")
    echo '{"number":7,"url":"https://github.com/felipe-urgal/dev-dashboard/pull/7","title":"feat: exemplo","state":"OPEN"}'
    ;;
  "pr close")
    exit 0
    ;;
  "pr edit")
    exit 0
    ;;
  "pr merge")
    exit 0
    ;;
  *)
    echo "comando gh inesperado: $*" >&2
    exit 1
    ;;
esac
`;

async function makeFixture(): Promise<{
  fixtureRoot: string;
  repoPath: string;
}> {
  const fixtureRoot = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-pr-mutation-routes-'),
  );
  const repoPath = path.join(fixtureRoot, 'sample');
  await execFileAsync('git', ['init', '-q', '-b', 'main', repoPath]);
  await git(repoPath, ['config', 'user.email', 'dev@example.com']);
  await git(repoPath, ['config', 'user.name', 'Dev']);
  await writeFile(path.join(repoPath, 'README.md'), 'v1\n');
  await git(repoPath, ['add', '.']);
  await git(repoPath, ['commit', '-q', '-m', 'init']);
  await git(repoPath, [
    'remote',
    'add',
    'origin',
    'git@github.com:felipe-urgal/dev-dashboard.git',
  ]);
  const mainHead = (
    await execFileAsync('git', ['rev-parse', 'HEAD'], {
      cwd: repoPath,
      encoding: 'utf8',
    })
  ).stdout.trim();
  await git(repoPath, ['update-ref', 'refs/remotes/origin/main', mainHead]);
  await git(repoPath, ['switch', '-q', '-c', 'feature/exemplo']);
  await writeFile(path.join(repoPath, 'feature.txt'), 'feature\n');
  await git(repoPath, ['add', '.']);
  await git(repoPath, ['commit', '-q', '-m', 'feat: exemplo']);
  await git(repoPath, [
    'update-ref',
    'refs/remotes/origin/feature/exemplo',
    'HEAD',
  ]);
  await git(repoPath, [
    'branch',
    '--set-upstream-to=origin/feature/exemplo',
    'feature/exemplo',
  ]);

  const binDirectory = path.join(fixtureRoot, 'bin');
  await mkdir(binDirectory, { recursive: true });
  await writeFile(path.join(binDirectory, 'gh'), FAKE_GH_SCRIPT);
  await chmod(path.join(binDirectory, 'gh'), 0o755);
  process.env.PATH = `${binDirectory}${path.delimiter}${process.env.PATH ?? ''}`;

  return { fixtureRoot, repoPath };
}

test('ações mutáveis de Pull Request via gh (criar, editar, fechar, mesclar)', async (context) => {
  const previousPath = process.env.PATH;
  const { fixtureRoot, repoPath } = await makeFixture();

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
    source: 'workspace',
    workspaceId: 'w1',
    favorite: false,
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
    process.env.PATH = previousPath;
    if (previousConfigDirectory === undefined)
      delete process.env.DEV_DASHBOARD_CONFIG_DIR;
    else process.env.DEV_DASHBOARD_CONFIG_DIR = previousConfigDirectory;
    if (previousStateDirectory === undefined)
      delete process.env.DEV_DASHBOARD_STATE_DIR;
    else process.env.DEV_DASHBOARD_STATE_DIR = previousStateDirectory;
    await rm(fixtureRoot, { recursive: true, force: true });
  });

  const headers = {
    'x-dev-dashboard-token': TOKEN,
    'content-type': 'application/json',
  };

  async function prepareAndExecute(body: Record<string, unknown>) {
    const confirmationResponse = await app.inject({
      method: 'POST',
      url: '/api/projects/p1/git/pull-request/confirmations',
      headers,
      payload: JSON.stringify(body),
    });
    assert.equal(confirmationResponse.statusCode, 201);
    const { confirmation } = confirmationResponse.json<ConfirmationResponse>();
    return app.inject({
      method: 'POST',
      url: '/api/projects/p1/git/pull-request/actions',
      headers,
      payload: JSON.stringify({
        ...body,
        confirmationToken: confirmation.token,
      }),
    });
  }

  await context.test('cria uma Pull Request', async () => {
    const response = await prepareAndExecute({
      actionId: 'pull-request-create',
      baseBranch: 'main',
      title: 'feat: exemplo',
      description: 'corpo da PR',
    });
    assert.equal(response.statusCode, 200);
    const { result } = response.json<ResultResponse>();
    assert.equal(result.number, 7);
    assert.equal(result.action, 'pull-request-create');
    assert.equal(result.state, 'open');
  });

  await context.test('edita a Pull Request', async () => {
    const response = await prepareAndExecute({
      actionId: 'pull-request-edit',
      number: 7,
      title: 'feat: exemplo (editado)',
    });
    assert.equal(response.statusCode, 200);
  });

  await context.test('rejeita ação fora do catálogo fechado', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/projects/p1/git/pull-request/confirmations',
      headers,
      payload: JSON.stringify({ actionId: 'pull-request-delete-repo' }),
    });
    assert.equal(response.statusCode, 400);
  });

  await context.test(
    'rejeita merge sem token de confirmação válido',
    async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/projects/p1/git/pull-request/actions',
        headers,
        payload: JSON.stringify({
          actionId: 'pull-request-merge',
          number: 7,
          mergeMethod: 'squash',
          confirmationToken: 'z'.repeat(64),
        }),
      });
      assert.equal(response.statusCode, 409);
      assert.equal(
        response.json<ErrorResponse>().error,
        'GIT_PULL_REQUEST_MUTATION_CONFIRMATION_REQUIRED',
      );
    },
  );

  await context.test(
    'mescla a Pull Request e registra no histórico',
    async () => {
      const response = await prepareAndExecute({
        actionId: 'pull-request-merge',
        number: 7,
        mergeMethod: 'squash',
      });
      assert.equal(response.statusCode, 200);
      const { result } = response.json<ResultResponse>();
      assert.equal(result.action, 'pull-request-merge');

      const historyResponse = await app.inject({
        method: 'GET',
        url: '/api/projects/p1/git/mutation-history',
        headers,
      });
      const history = historyResponse.json<HistoryResponse>();
      const mergeEvent = history.events.find(
        (event) => event.operationId === 'pull-request-merge',
      );
      assert.ok(mergeEvent);
      assert.equal(mergeEvent!.result, 'succeeded');
      assert.equal(mergeEvent!.risk, 'destructive');
    },
  );

  await context.test('fecha a Pull Request', async () => {
    const response = await prepareAndExecute({
      actionId: 'pull-request-close',
      number: 7,
    });
    assert.equal(response.statusCode, 200);
    const { result } = response.json<ResultResponse>();
    assert.equal(result.action, 'pull-request-close');
  });
});
