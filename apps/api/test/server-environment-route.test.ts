import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import type {
  ManagedProcess,
  Project,
  ProjectServerSettings,
} from '@dev-dashboard/contracts';

const TOKEN = 's'.repeat(64);

interface ProjectServerConfiguration {
  settings: ProjectServerSettings;
  environments: string[];
}

test('configura e aplica o ambiente Node escolhido ao iniciar', async (context) => {
  const root = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-server-env-route-'),
  );
  const projectPath = path.join(root, 'project');
  await mkdir(projectPath, { recursive: true });
  await Promise.all([
    writeFile(
      path.join(projectPath, 'package.json'),
      JSON.stringify({ scripts: { dev: 'vite' } }),
    ),
    writeFile(
      path.join(projectPath, '.env.development'),
      'APP_ENV=development\n',
    ),
    writeFile(path.join(projectPath, '.env.staging'), 'APP_ENV=staging\n'),
    writeFile(path.join(projectPath, '.env.example'), 'APP_ENV=example\n'),
  ]);

  const previousConfigDirectory = process.env.DEV_DASHBOARD_CONFIG_DIR;
  const previousStateDirectory = process.env.DEV_DASHBOARD_STATE_DIR;
  process.env.DEV_DASHBOARD_CONFIG_DIR = path.join(root, 'config');
  process.env.DEV_DASHBOARD_STATE_DIR = path.join(root, 'state');

  const { buildApp } = await import('../src/app.js');
  const { createAppContext } = await import('../src/app-context.js');
  const appContext = createAppContext();
  const project: Project = {
    id: 'p1',
    name: 'sample-node',
    path: projectPath,
    type: 'node',
    source: 'workspace',
    workspaceId: 'w1',
    favorite: false,
    capabilities: ['server'],
  };
  appContext.projectStore.saveWorkspaceScan({
    workspaceId: 'w1',
    workspacePath: root,
    projects: [project],
    warnings: [],
  });

  appContext.processManager.startServer = async (
    _project,
    options,
  ): Promise<ManagedProcess> => ({
    id: 'p1:server',
    projectId: 'p1',
    kind: 'server',
    status: 'starting',
    port: options.port ?? 3_000,
  });

  const app = await buildApp({
    localToken: TOKEN,
    context: appContext,
  });
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
    await rm(root, { recursive: true, force: true });
  });

  const headers = {
    'x-dev-dashboard-token': TOKEN,
    'content-type': 'application/json',
  };

  const catalogResponse = await app.inject({
    method: 'GET',
    url: '/api/projects/p1/server-settings',
    headers,
  });
  assert.equal(catalogResponse.statusCode, 200);
  assert.deepEqual(
    catalogResponse.json<ProjectServerConfiguration>().environments,
    ['development', 'staging'],
  );

  const saveResponse = await app.inject({
    method: 'PUT',
    url: '/api/projects/p1/server-settings',
    headers,
    payload: JSON.stringify({
      port: 3_200,
      healthCheckPath: null,
      environment: 'staging',
    }),
  });
  assert.equal(saveResponse.statusCode, 200);
  assert.equal(
    saveResponse.json<ProjectServerConfiguration>().settings.environment,
    'staging',
  );

  const startResponse = await app.inject({
    method: 'POST',
    url: '/api/projects/p1/process/start',
    headers,
    payload: JSON.stringify({ port: 3_300 }),
  });
  assert.equal(startResponse.statusCode, 201);
  assert.equal(
    await readFile(path.join(projectPath, '.env.local'), 'utf8'),
    'APP_ENV=staging\n',
  );

  const invalidResponse = await app.inject({
    method: 'PUT',
    url: '/api/projects/p1/server-settings',
    headers,
    payload: JSON.stringify({ environment: 'production' }),
  });
  assert.equal(invalidResponse.statusCode, 400);
  assert.equal(
    invalidResponse.json<{ error: string }>().error,
    'SERVER_ENVIRONMENT_NOT_FOUND',
  );
});
