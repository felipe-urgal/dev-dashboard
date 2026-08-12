import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import type { ManagedProcess, Project } from '@dev-dashboard/contracts';

const TOKEN = 'w'.repeat(64);

interface WorkerOverviewResponse {
  worker: { id: string; detected: boolean; process: ManagedProcess | null };
}
interface ProcessResponse {
  process: ManagedProcess;
}
interface LogResponse {
  log: { content: string; masked: boolean; redactionCount: number };
}
interface CredentialsResponse {
  credentials: {
    supported: boolean;
    environments: Array<{
      name: string;
      credentialsFileExists: boolean;
      keyFileExists: boolean;
      keySource: string;
    }>;
  };
}
interface ErrorResponse {
  error?: string;
}

async function waitForStatus(
  app: Awaited<ReturnType<typeof import('../src/app.js').buildApp>>,
  headers: Record<string, string>,
  workerId: string,
  status: string,
): Promise<ManagedProcess> {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const response = await app.inject({
      method: 'GET',
      url: `/api/projects/p1/rails/workers/${workerId}`,
      headers,
    });
    const { worker } = response.json<WorkerOverviewResponse>();
    if (worker.process?.status === status) {
      return worker.process;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`O worker ${workerId} não alcançou o estado ${status}.`);
}

test('rotas de workers (Sidekiq/webpack) e credentials Rails', async (context) => {
  const fixtureRoot = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-rails-worker-routes-'),
  );
  const projectPath = path.join(fixtureRoot, 'sample');
  await mkdir(path.join(projectPath, 'bin'), { recursive: true });
  await mkdir(path.join(projectPath, 'config'), { recursive: true });
  await mkdir(path.join(projectPath, 'config', 'credentials'), {
    recursive: true,
  });
  await writeFile(
    path.join(projectPath, 'Gemfile'),
    'gem "rails"\ngem "sidekiq"\n',
  );

  const sidekiqScript = [
    '#!/bin/sh',
    'echo "DATABASE_URL=postgres://user:secret@localhost/db"',
    'sleep 60',
    '',
  ].join('\n');
  await writeFile(path.join(projectPath, 'bin', 'sidekiq'), sidekiqScript);
  await chmod(path.join(projectPath, 'bin', 'sidekiq'), 0o755);

  const webpackScript = ['#!/bin/sh', 'sleep 60', ''].join('\n');
  await writeFile(
    path.join(projectPath, 'bin', 'webpack-dev-server'),
    webpackScript,
  );
  await chmod(path.join(projectPath, 'bin', 'webpack-dev-server'), 0o755);

  await writeFile(
    path.join(projectPath, 'config', 'master.key'),
    'x'.repeat(32),
  );
  await writeFile(
    path.join(projectPath, 'config', 'credentials.yml.enc'),
    'encrypted-default\n',
  );
  await writeFile(
    path.join(projectPath, 'config', 'credentials', 'production.yml.enc'),
    'encrypted-production\n',
  );
  await writeFile(
    path.join(projectPath, 'config', 'credentials', 'production.key'),
    'y'.repeat(32),
  );

  const previousConfigDirectory = process.env.DEV_DASHBOARD_CONFIG_DIR;
  const previousStateDirectory = process.env.DEV_DASHBOARD_STATE_DIR;
  process.env.DEV_DASHBOARD_CONFIG_DIR = path.join(
    fixtureRoot,
    'config-dashboard',
  );
  process.env.DEV_DASHBOARD_STATE_DIR = path.join(fixtureRoot, 'state');

  const { buildApp } = await import('../src/app.js');
  const { createAppContext } = await import('../src/app-context.js');

  const appContext = createAppContext();

  const project: Project = {
    id: 'p1',
    name: 'sample',
    path: projectPath,
    type: 'rails',
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
    await appContext.processManager
      .stopWorker('p1', 'worker')
      .catch(() => undefined);
    await appContext.processManager
      .stopWorker('p1', 'webpack')
      .catch(() => undefined);
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
    'detecta Sidekiq via Gemfile e webpack via bin/webpack-dev-server',
    async () => {
      const sidekiq = await app.inject({
        method: 'GET',
        url: '/api/projects/p1/rails/workers/sidekiq',
        headers,
      });
      assert.equal(sidekiq.statusCode, 200);
      assert.equal(
        sidekiq.json<WorkerOverviewResponse>().worker.detected,
        true,
      );
      assert.equal(sidekiq.json<WorkerOverviewResponse>().worker.process, null);

      const webpack = await app.inject({
        method: 'GET',
        url: '/api/projects/p1/rails/workers/webpack',
        headers,
      });
      assert.equal(webpack.statusCode, 200);
      assert.equal(
        webpack.json<WorkerOverviewResponse>().worker.detected,
        true,
      );
    },
  );

  await context.test('rejeita workerId fora do catálogo fechado', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/projects/p1/rails/workers/redis',
      headers,
    });
    assert.equal(response.statusCode, 400);
  });

  await context.test('rota exige autenticação', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/projects/p1/rails/workers/sidekiq',
    });
    assert.equal(response.statusCode, 401);
  });

  await context.test('inicia, mascara logs e para o Sidekiq', async () => {
    const startResponse = await app.inject({
      method: 'POST',
      url: '/api/projects/p1/rails/workers/sidekiq/start',
      headers: jsonHeaders,
      payload: '{}',
    });
    assert.equal(startResponse.statusCode, 201);
    const started = startResponse.json<ProcessResponse>().process;
    assert.equal(started.kind, 'worker');
    assert.equal(started.command, path.join(projectPath, 'bin', 'sidekiq'));

    await waitForStatus(app, headers, 'sidekiq', 'running');

    let logs: LogResponse['log'] = {
      content: '',
      masked: false,
      redactionCount: 0,
    };
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const logsResponse = await app.inject({
        method: 'GET',
        url: '/api/projects/p1/rails/workers/sidekiq/logs',
        headers,
      });
      logs = logsResponse.json<LogResponse>().log;
      if (logs.content.length > 0) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    assert.match(logs.content, /DATABASE_URL=/);
    assert.doesNotMatch(logs.content, /secret@localhost/);
    assert.equal(logs.masked, true);
    assert.ok(logs.redactionCount > 0);

    const stopResponse = await app.inject({
      method: 'POST',
      url: '/api/projects/p1/rails/workers/sidekiq/stop',
      headers: jsonHeaders,
      payload: '{}',
    });
    assert.equal(stopResponse.statusCode, 200);
    assert.equal(
      stopResponse.json<ProcessResponse>().process.status,
      'stopped',
    );
  });

  await context.test(
    'sidekiq e webpack rodam como processos independentes',
    async () => {
      await app.inject({
        method: 'POST',
        url: '/api/projects/p1/rails/workers/sidekiq/start',
        headers: jsonHeaders,
        payload: '{}',
      });
      await app.inject({
        method: 'POST',
        url: '/api/projects/p1/rails/workers/webpack/start',
        headers: jsonHeaders,
        payload: '{}',
      });

      const sidekiqRunning = await waitForStatus(
        app,
        headers,
        'sidekiq',
        'running',
      );
      const webpackRunning = await waitForStatus(
        app,
        headers,
        'webpack',
        'running',
      );
      assert.notEqual(sidekiqRunning.pid, webpackRunning.pid);

      await app.inject({
        method: 'POST',
        url: '/api/projects/p1/rails/workers/sidekiq/stop',
        headers: jsonHeaders,
        payload: '{}',
      });
      await app.inject({
        method: 'POST',
        url: '/api/projects/p1/rails/workers/webpack/stop',
        headers: jsonHeaders,
        payload: '{}',
      });
    },
  );

  await context.test('reinicia o Sidekiq (stop + start)', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/projects/p1/rails/workers/sidekiq/start',
      headers: jsonHeaders,
      payload: '{}',
    });
    await waitForStatus(app, headers, 'sidekiq', 'running');

    const restartResponse = await app.inject({
      method: 'POST',
      url: '/api/projects/p1/rails/workers/sidekiq/restart',
      headers: jsonHeaders,
      payload: '{}',
    });
    assert.equal(restartResponse.statusCode, 200);
    assert.equal(
      restartResponse.json<ProcessResponse>().process.status,
      'running',
    );

    await app.inject({
      method: 'POST',
      url: '/api/projects/p1/rails/workers/sidekiq/stop',
      headers: jsonHeaders,
      payload: '{}',
    });
  });

  await context.test(
    'rejeita reiniciar webpack (sem restart no catálogo)',
    async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/projects/p1/rails/workers/webpack/restart',
        headers: jsonHeaders,
        payload: '{}',
      });
      assert.equal(response.statusCode, 409);
      assert.equal(
        response.json<ErrorResponse>().error,
        'RAILS_WORKER_RESTART_UNSUPPORTED',
      );
    },
  );

  await context.test(
    'retorna status de credentials sem expor conteúdo ou chave',
    async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/projects/p1/rails/credentials',
        headers,
      });
      assert.equal(response.statusCode, 200);
      const { credentials } = response.json<CredentialsResponse>();
      assert.equal(credentials.supported, true);

      const defaultEnv = credentials.environments.find(
        (item) => item.name === 'default',
      );
      assert.equal(defaultEnv?.credentialsFileExists, true);
      assert.equal(defaultEnv?.keyFileExists, true);
      assert.equal(defaultEnv?.keySource, 'file');

      const productionEnv = credentials.environments.find(
        (item) => item.name === 'production',
      );
      assert.equal(productionEnv?.credentialsFileExists, true);
      assert.equal(productionEnv?.keyFileExists, true);

      const rawBody = response.body;
      assert.doesNotMatch(rawBody, /encrypted-default/);
      assert.doesNotMatch(rawBody, new RegExp('x'.repeat(32)));
      assert.doesNotMatch(rawBody, new RegExp('y'.repeat(32)));
    },
  );

  await context.test('retorna 404 para projeto inexistente', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/projects/does-not-exist/rails/workers/sidekiq',
      headers,
    });
    assert.equal(response.statusCode, 404);
    assert.equal(response.json<ErrorResponse>().error, 'PROJECT_NOT_FOUND');
  });
});

test('worker não detectado recusa start com catálogo fechado', async (context) => {
  const fixtureRoot = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-rails-worker-routes-undetected-'),
  );
  const projectPath = path.join(fixtureRoot, 'sample');
  await mkdir(projectPath, { recursive: true });
  await writeFile(path.join(projectPath, 'Gemfile'), 'gem "rails"\n');

  const previousConfigDirectory = process.env.DEV_DASHBOARD_CONFIG_DIR;
  const previousStateDirectory = process.env.DEV_DASHBOARD_STATE_DIR;
  process.env.DEV_DASHBOARD_CONFIG_DIR = path.join(
    fixtureRoot,
    'config-dashboard',
  );
  process.env.DEV_DASHBOARD_STATE_DIR = path.join(fixtureRoot, 'state');

  const { buildApp } = await import('../src/app.js');
  const { createAppContext } = await import('../src/app-context.js');

  const appContext = createAppContext();
  const project: Project = {
    id: 'p2',
    name: 'sample-no-sidekiq',
    path: projectPath,
    type: 'rails',
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

  const headers = {
    'x-dev-dashboard-token': TOKEN,
    'content-type': 'application/json',
  };

  await context.test('overview reporta detected: false', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/projects/p2/rails/workers/sidekiq',
      headers,
    });
    assert.equal(response.statusCode, 200);
    assert.equal(
      response.json<WorkerOverviewResponse>().worker.detected,
      false,
    );
  });

  await context.test('start recusa worker não detectado', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/projects/p2/rails/workers/sidekiq/start',
      headers,
      payload: '{}',
    });
    assert.equal(response.statusCode, 409);
    assert.equal(
      response.json<ErrorResponse>().error,
      'RAILS_WORKER_UNSUPPORTED',
    );
  });

  await context.test(
    'credentials não suportadas sem config/credentials.yml.enc',
    async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/projects/p2/rails/credentials',
        headers,
      });
      assert.equal(response.statusCode, 200);
      const { credentials } = response.json<CredentialsResponse>();
      assert.equal(credentials.supported, false);
      assert.equal(credentials.environments[0]?.credentialsFileExists, false);
      assert.equal(credentials.environments[0]?.keyFileExists, false);
      assert.equal(credentials.environments[0]?.keySource, 'missing');
    },
  );
});
