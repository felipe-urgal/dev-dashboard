import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

const TOKEN = 'd'.repeat(64);

interface StatusResponse {
  snapshot: { actionId: string; status: string } | null;
}
interface StartResponse {
  snapshot: { actionId: string; actionName: string; status: string };
}
interface ErrorResponse {
  error?: string;
}

test('rotas de execução destacável de dependências/build', async (context) => {
  const fixtureRoot = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-dependencies-pty-'),
  );
  const projectPath = path.join(fixtureRoot, 'sample');
  await mkdir(projectPath, { recursive: true });
  await writeFile(
    path.join(projectPath, 'package.json'),
    JSON.stringify({ scripts: { build: 'echo build' } }),
  );
  await writeFile(path.join(projectPath, 'package-lock.json'), '{}');

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
    path: projectPath,
    type: 'node',
    source: 'workspace',
    workspaceId: 'w1',
    enabled: true,
    capabilities: [],
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
    if (previousConfigDirectory === undefined)
      delete process.env.DEV_DASHBOARD_CONFIG_DIR;
    else process.env.DEV_DASHBOARD_CONFIG_DIR = previousConfigDirectory;
    if (previousStateDirectory === undefined)
      delete process.env.DEV_DASHBOARD_STATE_DIR;
    else process.env.DEV_DASHBOARD_STATE_DIR = previousStateDirectory;
    await rm(fixtureRoot, { recursive: true, force: true });
  });

  const headers = { 'x-dev-dashboard-token': TOKEN };
  const jsonHeaders = { ...headers, 'content-type': 'application/json' };

  await context.test(
    'sem execução em andamento, status retorna null',
    async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/projects/p1/dependencies/pty/status',
        headers,
      });
      assert.equal(response.statusCode, 200);
      assert.deepEqual(response.json<StatusResponse>(), { snapshot: null });
    },
  );

  await context.test(
    'rejeita uma ação fora do catálogo de dependências do projeto',
    async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/projects/p1/dependencies/pty/start',
        headers: jsonHeaders,
        payload: JSON.stringify({ actionId: 'bin:rails' }),
      });
      assert.equal(response.statusCode, 404);
      assert.equal(response.json<ErrorResponse>().error, 'SCRIPT_NOT_FOUND');
    },
  );

  await context.test(
    'inicia build, reporta running via status e aceita cancelamento',
    async () => {
      const startResponse = await app.inject({
        method: 'POST',
        url: '/api/projects/p1/dependencies/pty/start',
        headers: jsonHeaders,
        payload: JSON.stringify({ actionId: 'package-script:build' }),
      });
      assert.equal(startResponse.statusCode, 201);
      const { snapshot } = startResponse.json<StartResponse>();
      assert.equal(snapshot.actionId, 'package-script:build');
      assert.equal(snapshot.status, 'running');

      const statusResponse = await app.inject({
        method: 'GET',
        url: '/api/projects/p1/dependencies/pty/status',
        headers,
      });
      assert.equal(statusResponse.statusCode, 200);
      assert.equal(
        statusResponse.json<StatusResponse>().snapshot?.actionId,
        'package-script:build',
      );

      const cancelResponse = await app.inject({
        method: 'POST',
        url: '/api/projects/p1/dependencies/pty/cancel',
        headers: jsonHeaders,
        payload: '{}',
      });
      assert.equal(cancelResponse.statusCode, 200);
    },
  );

  await context.test('retorna 404 para projeto inexistente', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/projects/does-not-exist/dependencies/pty/status',
      headers,
    });
    assert.equal(response.statusCode, 404);
    assert.equal(response.json<ErrorResponse>().error, 'PROJECT_NOT_FOUND');
  });

  await context.test('rota exige autenticação', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/projects/p1/dependencies/pty/status',
    });
    assert.equal(response.statusCode, 401);
  });
});
