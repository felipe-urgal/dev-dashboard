import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import type {
  Project,
  ProjectEnvironmentContract,
  ProjectEnvironmentOverview,
  ProjectEnvironmentVariableValue,
} from '@dev-dashboard/contracts';

const TOKEN = 'e'.repeat(64);

interface EnvironmentResponse {
  environment: ProjectEnvironmentOverview;
}
interface EnvironmentContractResponse {
  contract: ProjectEnvironmentContract;
}
interface EnvironmentVariableValueResponse {
  variable: ProjectEnvironmentVariableValue;
}

test('lista variáveis e cria contrato secret-safe sem quebrar leitura explícita', async (context) => {
  const fixtureRoot = await mkdtemp(
    path.join(tmpdir(), 'project-environment-'),
  );
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
  await writeFile(
    path.join(projectPath, '.env.example'),
    [
      'DATABASE_URL=postgres://example/app',
      'API_SECRET_TOKEN=example-secret',
      'MISSING_REQUIRED=configure-me',
      '',
    ].join('\n'),
  );
  await writeFile(
    path.join(projectPath, '.env.production'),
    'DB_PASSWORD=prod-secret\n',
  );
  await writeFile(
    path.join(projectPath, '.env.production.example'),
    'DB_PASSWORD=replace-me\nPRODUCTION_ONLY=replace-me\n',
  );

  const previousConfigDirectory = process.env.DEV_DASHBOARD_CONFIG_DIR;
  process.env.DEV_DASHBOARD_CONFIG_DIR = path.join(
    fixtureRoot,
    'config-dashboard',
  );

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
    await rm(fixtureRoot, { recursive: true, force: true });
  });

  const headers = { 'x-dev-dashboard-token': TOKEN };

  const unauthorized = await app.inject({
    method: 'GET',
    url: '/api/projects/p1/environment-variables',
  });
  assert.equal(unauthorized.statusCode, 401);

  const unauthorizedContract = await app.inject({
    method: 'GET',
    url: '/api/projects/p1/environment-contract',
  });
  assert.equal(unauthorizedContract.statusCode, 401);

  const unauthorizedValue = await app.inject({
    method: 'GET',
    url: '/api/projects/p1/environment-variables/value?file=.env&name=API_SECRET_TOKEN',
  });
  assert.equal(unauthorizedValue.statusCode, 401);

  const response = await app.inject({
    method: 'GET',
    url: '/api/projects/p1/environment-variables',
    headers,
  });
  assert.equal(response.statusCode, 200);
  const { environment } = response.json<EnvironmentResponse>();

  const envFile = environment.files.find((entry) => entry.file === '.env');
  assert.ok(envFile);
  assert.deepEqual(envFile.variables, [
    {
      name: 'DATABASE_URL',
      value: 'postgres://localhost/app',
      sensitive: false,
    },
    { name: 'API_SECRET_TOKEN', sensitive: true },
    { name: 'QUOTED_VALUE', value: 'with spaces', sensitive: false },
    { name: 'EXPORTED', value: '1', sensitive: false },
  ]);
  assert.equal(JSON.stringify(environment).includes('super-secreto'), false);

  const productionFile = environment.files.find(
    (entry) => entry.file === '.env.production',
  );
  assert.deepEqual(productionFile?.variables, [
    { name: 'DB_PASSWORD', sensitive: true },
  ]);
  assert.equal(JSON.stringify(environment).includes('prod-secret'), false);

  const exampleFile = environment.files.find(
    (entry) => entry.file === '.env.example',
  );
  assert.ok(exampleFile);
  assert.equal(
    exampleFile.variables.some(
      (variable) => variable.name === 'MISSING_REQUIRED',
    ),
    true,
  );

  const contractResponse = await app.inject({
    method: 'GET',
    url: '/api/projects/p1/environment-contract',
    headers,
  });
  assert.equal(contractResponse.statusCode, 200);
  const { contract } = contractResponse.json<EnvironmentContractResponse>();
  const serializedContract = JSON.stringify(contract);
  assert.equal(serializedContract.includes('super-secreto'), false);
  assert.equal(serializedContract.includes('example-secret'), false);
  assert.equal(serializedContract.includes('prod-secret'), false);
  assert.equal(serializedContract.includes('postgres://localhost/app'), false);

  const defaultSection = contract.sections.find(
    (section) => section.scope === 'default',
  );
  assert.ok(defaultSection);
  assert.equal(defaultSection.baselineStatus, 'resolved');
  assert.equal(defaultSection.baseline, '.env.example');
  assert.deepEqual(
    defaultSection.variables.find((entry) => entry.name === 'DATABASE_URL'),
    {
      name: 'DATABASE_URL',
      sensitive: false,
      status: 'present',
      baseline: '.env.example',
      sources: ['.env'],
      required: true,
      suggestedAction: 'none',
    },
  );
  assert.deepEqual(
    defaultSection.variables.find((entry) => entry.name === 'MISSING_REQUIRED'),
    {
      name: 'MISSING_REQUIRED',
      sensitive: false,
      status: 'missing',
      baseline: '.env.example',
      sources: [],
      required: true,
      suggestedAction: 'configure',
    },
  );
  assert.equal(
    defaultSection.variables.find((entry) => entry.name === 'QUOTED_VALUE')
      ?.status,
    'undocumented',
  );
  assert.equal(
    defaultSection.variables.find((entry) => entry.name === 'API_SECRET_TOKEN')
      ?.sensitive,
    true,
  );

  const productionSection = contract.sections.find(
    (section) => section.scope === 'production',
  );
  assert.ok(productionSection);
  assert.equal(productionSection.baseline, '.env.production.example');
  assert.equal(
    productionSection.variables.find(
      (entry) => entry.name === 'PRODUCTION_ONLY',
    )?.status,
    'missing',
  );

  const valueResponse = await app.inject({
    method: 'GET',
    url: '/api/projects/p1/environment-variables/value?file=.env&name=API_SECRET_TOKEN',
    headers,
  });
  assert.equal(valueResponse.statusCode, 200);
  assert.deepEqual(
    valueResponse.json<EnvironmentVariableValueResponse>().variable,
    {
      file: '.env',
      name: 'API_SECRET_TOKEN',
      value: 'super-secreto',
      sensitive: true,
    },
  );

  const missingVariable = await app.inject({
    method: 'GET',
    url: '/api/projects/p1/environment-variables/value?file=.env&name=NOT_FOUND',
    headers,
  });
  assert.equal(missingVariable.statusCode, 404);

  const invalidFile = await app.inject({
    method: 'GET',
    url: '/api/projects/p1/environment-variables/value?file=.env.backup&name=API_SECRET_TOKEN',
    headers,
  });
  assert.equal(invalidFile.statusCode, 400);

  const notFound = await app.inject({
    method: 'GET',
    url: '/api/projects/missing/environment-variables',
    headers,
  });
  assert.equal(notFound.statusCode, 404);
});

test('não escolhe baseline silenciosamente quando example e sample coexistem', async (context) => {
  const fixtureRoot = await mkdtemp(
    path.join(tmpdir(), 'project-environment-ambiguous-'),
  );
  const projectPath = path.join(fixtureRoot, 'sample');
  await mkdir(projectPath, { recursive: true });
  await writeFile(path.join(projectPath, '.env.example'), 'FOO=example\n');
  await writeFile(path.join(projectPath, '.env.sample'), 'BAR=sample\n');
  await writeFile(path.join(projectPath, '.env.local'), 'FOO=local\n');

  const { ProjectEnvironmentService } =
    await import('../src/services/project-environment-service.js');
  const service = new ProjectEnvironmentService();
  const project: Project = {
    id: 'p2',
    name: 'ambiguous',
    path: projectPath,
    type: 'node',
    source: 'workspace',
    workspaceId: 'w1',
    enabled: true,
    capabilities: [],
  };

  context.after(async () => {
    await rm(fixtureRoot, { recursive: true, force: true });
  });

  const contract = await service.getContract(project);
  const defaultSection = contract.sections.find(
    (section) => section.scope === 'default',
  );
  assert.ok(defaultSection);
  assert.equal(defaultSection.baselineStatus, 'ambiguous');
  assert.equal(defaultSection.baseline, null);
  assert.deepEqual(defaultSection.baselineCandidates, [
    '.env.example',
    '.env.sample',
  ]);
  assert.equal(
    defaultSection.variables.every(
      (variable) =>
        variable.status === 'unknown' &&
        variable.suggestedAction === 'choose-baseline',
    ),
    true,
  );
});
