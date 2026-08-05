import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import type {
  Project,
  ProjectEnvironmentOverview,
  ProjectEnvironmentVariableValue,
} from '@dev-dashboard/contracts';

const TOKEN = 'e'.repeat(64);

interface EnvironmentResponse { environment: ProjectEnvironmentOverview }
interface EnvironmentVariableValueResponse { variable: ProjectEnvironmentVariableValue }

test('lista variáveis de .env e revela valores sensíveis somente sob demanda', async (context) => {
  const fixtureRoot = await mkdtemp(path.join(tmpdir(), 'project-environment-'));
  const projectPath = path.join(fixtureRoot, 'sample');
  await mkdir(projectPath, { recursive: true });

  await writeFile(
    path.join(projectPath, '.env'),
    [
      'DATABASE_URL=postgres://localhost/app',
      'API_SECRET_TOKEN=super-secreto',
      "QUOTED_VALUE='with spaces'",
      'export EXPORTED=1',
      '# comentário ignorado',
      '',
    ].join('\n'),
  );
  await writeFile(path.join(projectPath, '.env.production'), 'DB_PASSWORD=prod-secret\n');

  const previousConfigDirectory = process.env.DEV_DASHBOARD_CONFIG_DIR;
  process.env.DEV_DASHBOARD_CONFIG_DIR = path.join(fixtureRoot, 'config-dashboard');

  const { buildApp } = await import('../src/app.js');
  const { createAppContext } = await import('../src/app-context.js');

  const appContext = createAppContext();
  const project: Project = {
    id: 'p1', name: 'sample', path: projectPath,
    type: 'node', source: 'workspace', workspaceId: 'w1', favorite: false, capabilities: [],
  };
  appContext.projectStore.saveWorkspaceScan({
    workspaceId: 'w1', workspacePath: fixtureRoot, projects: [project], warnings: [],
  });

  const app = await buildApp({ localToken: TOKEN, context: appContext });

  context.after(async () => {
    await app.close();
    if (previousConfigDirectory === undefined) delete process.env.DEV_DASHBOARD_CONFIG_DIR;
    else process.env.DEV_DASHBOARD_CONFIG_DIR = previousConfigDirectory;
    await rm(fixtureRoot, { recursive: true, force: true });
  });

  const headers = { 'x-dev-dashboard-token': TOKEN };

  const unauthorized = await app.inject({ method: 'GET', url: '/api/projects/p1/environment-variables' });
  assert.equal(unauthorized.statusCode, 401);

  const unauthorizedValue = await app.inject({
    method: 'GET',
    url: '/api/projects/p1/environment-variables/value?file=.env&name=API_SECRET_TOKEN',
  });
  assert.equal(unauthorizedValue.statusCode, 401);

  const response = await app.inject({ method: 'GET', url: '/api/projects/p1/environment-variables', headers });
  assert.equal(response.statusCode, 200);
  const { environment } = response.json<EnvironmentResponse>();

  const envFile = environment.files.find((entry) => entry.file === '.env');
  assert.ok(envFile);
  assert.deepEqual(envFile.variables, [
    { name: 'DATABASE_URL', value: 'postgres://localhost/app', sensitive: false },
    { name: 'API_SECRET_TOKEN', sensitive: true },
    { name: 'QUOTED_VALUE', value: 'with spaces', sensitive: false },
    { name: 'EXPORTED', value: '1', sensitive: false },
  ]);
  assert.equal(JSON.stringify(environment).includes('super-secreto'), false);

  const productionFile = environment.files.find((entry) => entry.file === '.env.production');
  assert.deepEqual(productionFile?.variables, [{ name: 'DB_PASSWORD', sensitive: true }]);
  assert.equal(JSON.stringify(environment).includes('prod-secret'), false);

  assert.equal(environment.files.some((entry) => entry.file === '.env.local'), false);

  const valueResponse = await app.inject({
    method: 'GET',
    url: '/api/projects/p1/environment-variables/value?file=.env&name=API_SECRET_TOKEN',
    headers,
  });
  assert.equal(valueResponse.statusCode, 200);
  assert.deepEqual(valueResponse.json<EnvironmentVariableValueResponse>().variable, {
    file: '.env',
    name: 'API_SECRET_TOKEN',
    value: 'super-secreto',
    sensitive: true,
  });

  const missingVariable = await app.inject({
    method: 'GET',
    url: '/api/projects/p1/environment-variables/value?file=.env&name=NOT_FOUND',
    headers,
  });
  assert.equal(missingVariable.statusCode, 404);

  const invalidFile = await app.inject({
    method: 'GET',
    url: '/api/projects/p1/environment-variables/value?file=.env.example&name=API_SECRET_TOKEN',
    headers,
  });
  assert.equal(invalidFile.statusCode, 400);

  const notFound = await app.inject({ method: 'GET', url: '/api/projects/missing/environment-variables', headers });
  assert.equal(notFound.statusCode, 404);
});
