import assert from 'node:assert/strict';
import {
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
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

test('lista ambientes com masking conservador e reveal explícito sem cache', async (context) => {
  const fixtureRoot = await mkdtemp(
    path.join(tmpdir(), 'project-environment-'),
  );
  const projectPath = path.join(fixtureRoot, 'sample');
  await mkdir(path.join(projectPath, '.dev-dashboard'), { recursive: true });

  await writeFile(
    path.join(projectPath, '.env'),
    [
      'DATABASE_URL=postgres://admin:minha-senha@localhost/app',
      'CUSTOM_ENDPOINT=https://user:token@example.test/path',
      'PUBLIC_API_URL=https://example.com',
      'API_SECRET_TOKEN=super-secreto',
      "QUOTED_VALUE='with spaces'",
      'export EXPORTED=1',
      '',
    ].join('\n'),
  );
  await writeFile(
    path.join(projectPath, '.env.example'),
    [
      'DATABASE_URL=postgres://example/app',
      'PUBLIC_API_URL=https://example.test',
      'API_SECRET_TOKEN=replace-me',
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
  await writeFile(
    path.join(projectPath, '.dev-dashboard', '.env.production.local'),
    'PRODUCTION_ONLY=runtime-secret\n',
  );
  await writeFile(
    path.join(projectPath, '.dev-dashboard', '.env.check.local'),
    'TEST_DATABASE_URL=postgres://test:test@localhost/app_test\n',
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

  const unauthorizedReveal = await app.inject({
    method: 'POST',
    url: '/api/projects/p1/environment-variables/reveal',
    payload: { file: '.env', name: 'API_SECRET_TOKEN' },
  });
  assert.equal(unauthorizedReveal.statusCode, 401);

  const response = await app.inject({
    method: 'GET',
    url: '/api/projects/p1/environment-variables',
    headers,
  });
  assert.equal(response.statusCode, 200);
  const { environment } = response.json<EnvironmentResponse>();

  const envFile = environment.files.find((entry) => entry.file === '.env');
  assert.ok(envFile);
  assert.equal(envFile.status, 'available');
  assert.equal(envFile.source, 'project');
  assert.deepEqual(
    envFile.variables.find((entry) => entry.name === 'DATABASE_URL'),
    { name: 'DATABASE_URL', sensitive: true },
  );
  assert.deepEqual(
    envFile.variables.find((entry) => entry.name === 'CUSTOM_ENDPOINT'),
    { name: 'CUSTOM_ENDPOINT', sensitive: true },
  );
  assert.deepEqual(
    envFile.variables.find((entry) => entry.name === 'PUBLIC_API_URL'),
    {
      name: 'PUBLIC_API_URL',
      value: 'https://example.com',
      sensitive: false,
    },
  );
  assert.equal(JSON.stringify(environment).includes('minha-senha'), false);
  assert.equal(JSON.stringify(environment).includes('super-secreto'), false);
  assert.equal(JSON.stringify(environment).includes('runtime-secret'), false);

  const productionLocal = environment.files.find(
    (entry) => entry.file === '.dev-dashboard/.env.production.local',
  );
  assert.ok(productionLocal);
  assert.equal(productionLocal.source, 'dashboard-production');
  assert.deepEqual(productionLocal.variables, [
    { name: 'PRODUCTION_ONLY', sensitive: true },
  ]);

  const checkLocal = environment.files.find(
    (entry) => entry.file === '.dev-dashboard/.env.check.local',
  );
  assert.ok(checkLocal);
  assert.equal(checkLocal.source, 'dashboard-check');
  assert.deepEqual(checkLocal.variables, [
    { name: 'TEST_DATABASE_URL', sensitive: true },
  ]);

  const contractResponse = await app.inject({
    method: 'GET',
    url: '/api/projects/p1/environment-contract',
    headers,
  });
  assert.equal(contractResponse.statusCode, 200);
  const { contract } = contractResponse.json<EnvironmentContractResponse>();
  const serializedContract = JSON.stringify(contract);
  for (const secret of [
    'minha-senha',
    'super-secreto',
    'runtime-secret',
    'postgres://test:test@localhost/app_test',
  ]) {
    assert.equal(serializedContract.includes(secret), false);
  }

  const defaultSection = contract.sections.find(
    (section) => section.scope === 'default',
  );
  assert.ok(defaultSection);
  assert.equal(defaultSection.baselineStatus, 'resolved');
  assert.deepEqual(
    defaultSection.variables.find((entry) => entry.name === 'DATABASE_URL'),
    {
      name: 'DATABASE_URL',
      sensitive: true,
      status: 'present',
      baseline: '.env.example',
      sources: ['.env'],
      required: true,
      suggestedAction: 'none',
    },
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
    'present',
  );
  assert.deepEqual(productionSection.sourceFiles, [
    '.dev-dashboard/.env.production.local',
    '.env.production',
  ]);

  const testSection = contract.sections.find(
    (section) => section.scope === 'test',
  );
  assert.ok(testSection);
  assert.equal(testSection.baselineStatus, 'missing');
  assert.deepEqual(testSection.sourceFiles, [
    '.dev-dashboard/.env.check.local',
  ]);

  const reveal = await app.inject({
    method: 'POST',
    url: '/api/projects/p1/environment-variables/reveal',
    headers,
    payload: { file: '.env', name: 'DATABASE_URL' },
  });
  assert.equal(reveal.statusCode, 200);
  assert.match(reveal.headers['cache-control'] ?? '', /no-store/u);
  assert.equal(reveal.headers.pragma, 'no-cache');
  assert.deepEqual(
    reveal.json<EnvironmentVariableValueResponse>().variable,
    {
      file: '.env',
      name: 'DATABASE_URL',
      value: 'postgres://admin:minha-senha@localhost/app',
      sensitive: true,
    },
  );

  const missingVariable = await app.inject({
    method: 'POST',
    url: '/api/projects/p1/environment-variables/reveal',
    headers,
    payload: { file: '.env', name: 'NOT_FOUND' },
  });
  assert.equal(missingVariable.statusCode, 404);

  const invalidFile = await app.inject({
    method: 'POST',
    url: '/api/projects/p1/environment-variables/reveal',
    headers,
    payload: { file: '.env.backup', name: 'API_SECRET_TOKEN' },
  });
  assert.equal(invalidFile.statusCode, 400);

  const legacyGet = await app.inject({
    method: 'GET',
    url: '/api/projects/p1/environment-variables/value?file=.env&name=API_SECRET_TOKEN',
    headers,
  });
  assert.equal(legacyGet.statusCode, 404);
});

test('usa o cwd da Environment Instance selecionada em vez do checkout principal', async (context) => {
  const fixtureRoot = await mkdtemp(
    path.join(tmpdir(), 'project-environment-instance-'),
  );
  const projectPath = path.join(fixtureRoot, 'main');
  const worktreePath = path.join(fixtureRoot, 'worktree');
  await mkdir(projectPath, { recursive: true });
  await mkdir(worktreePath, { recursive: true });
  await writeFile(path.join(projectPath, '.env'), 'MAIN_ONLY=1\n');
  await writeFile(path.join(worktreePath, '.env'), 'WORKTREE_ONLY=1\n');

  const previousConfigDirectory = process.env.DEV_DASHBOARD_CONFIG_DIR;
  process.env.DEV_DASHBOARD_CONFIG_DIR = path.join(
    fixtureRoot,
    'config-dashboard',
  );

  const { buildApp } = await import('../src/app.js');
  const { createAppContext } = await import('../src/app-context.js');

  const appContext = createAppContext();
  const project: Project = {
    id: 'p-worktree',
    name: 'worktree-aware',
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
  const instances =
    appContext.developmentEnvironmentInstanceStore.reconcileWorktrees(
      project.id,
      [{ id: 'wt-1', path: worktreePath, kind: 'linked' }],
    );
  const worktree = instances.find(
    (entry) => entry.source.kind === 'worktree',
  );
  assert.ok(worktree);

  const app = await buildApp({ localToken: TOKEN, context: appContext });
  context.after(async () => {
    await app.close();
    if (previousConfigDirectory === undefined)
      delete process.env.DEV_DASHBOARD_CONFIG_DIR;
    else process.env.DEV_DASHBOARD_CONFIG_DIR = previousConfigDirectory;
    await rm(fixtureRoot, { recursive: true, force: true });
  });

  const query = new URLSearchParams({
    environmentInstanceId: worktree.id,
  });
  const response = await app.inject({
    method: 'GET',
    url: `/api/projects/${project.id}/environment-variables?${query}`,
    headers: { 'x-dev-dashboard-token': TOKEN },
  });
  assert.equal(response.statusCode, 200);
  const { environment } = response.json<EnvironmentResponse>();
  const envFile = environment.files.find((entry) => entry.file === '.env');
  assert.ok(envFile);
  assert.equal(
    envFile.variables.some((entry) => entry.name === 'WORKTREE_ONLY'),
    true,
  );
  assert.equal(
    envFile.variables.some((entry) => entry.name === 'MAIN_ONLY'),
    false,
  );

  const wrongInstance = await app.inject({
    method: 'GET',
    url: `/api/projects/${project.id}/environment-variables?environmentInstanceId=missing`,
    headers: { 'x-dev-dashboard-token': TOKEN },
  });
  assert.equal(wrongInstance.statusCode, 404);
});

test('recusa symlink e arquivo acima do limite sem ler conteúdo externo', async (context) => {
  const fixtureRoot = await mkdtemp(
    path.join(tmpdir(), 'project-environment-safe-read-'),
  );
  const projectPath = path.join(fixtureRoot, 'sample');
  await mkdir(projectPath, { recursive: true });
  const outside = path.join(fixtureRoot, 'outside.env');
  await writeFile(outside, 'OUTSIDE_SECRET=nunca-vazar\n');
  await symlink(outside, path.join(projectPath, '.env'));
  await writeFile(
    path.join(projectPath, '.env.production'),
    `TOO_BIG=${'x'.repeat(70 * 1024)}\n`,
  );

  const { ProjectEnvironmentService } =
    await import('../src/services/project-environment-service.js');
  const service = new ProjectEnvironmentService();
  const project: Project = {
    id: 'p-safe',
    name: 'safe',
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

  const overview = await service.getOverview(project);
  assert.deepEqual(
    overview.files.find((entry) => entry.file === '.env'),
    {
      file: '.env',
      status: 'invalid',
      source: 'project',
      variables: [],
    },
  );
  assert.deepEqual(
    overview.files.find((entry) => entry.file === '.env.production'),
    {
      file: '.env.production',
      status: 'too-large',
      source: 'project',
      variables: [],
    },
  );
  assert.equal(JSON.stringify(overview).includes('nunca-vazar'), false);
  assert.equal(await service.getVariableValue(project, '.env', 'OUTSIDE_SECRET'), null);
});

test('classifica conflito real entre fontes e resolve baselines de test/docker suportados', async (context) => {
  const fixtureRoot = await mkdtemp(
    path.join(tmpdir(), 'project-environment-contract-'),
  );
  const projectPath = path.join(fixtureRoot, 'sample');
  await mkdir(path.join(projectPath, '.dev-dashboard'), { recursive: true });
  await writeFile(path.join(projectPath, '.env.example'), 'FOO=example\n');
  await writeFile(path.join(projectPath, '.env'), 'FOO=a\n');
  await writeFile(path.join(projectPath, '.env.local'), 'FOO=b\n');
  await writeFile(
    path.join(projectPath, '.env.test.example'),
    'TEST_DATABASE_URL=replace\n',
  );
  await writeFile(
    path.join(projectPath, '.dev-dashboard', '.env.check.local'),
    'TEST_DATABASE_URL=postgres://test:test@localhost/app\n',
  );
  await writeFile(path.join(projectPath, '.env.docker.example'), 'PORT=3000\n');
  await writeFile(path.join(projectPath, '.env.docker'), 'PORT=3001\n');

  const { ProjectEnvironmentService } =
    await import('../src/services/project-environment-service.js');
  const service = new ProjectEnvironmentService();
  const project: Project = {
    id: 'p-contract',
    name: 'contract',
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
  assert.equal(
    defaultSection.variables.find((entry) => entry.name === 'FOO')?.status,
    'conflicting-source',
  );

  const testSection = contract.sections.find(
    (section) => section.scope === 'test',
  );
  assert.equal(testSection?.baselineStatus, 'resolved');
  assert.equal(testSection?.baseline, '.env.test.example');
  assert.equal(
    testSection?.variables.find((entry) => entry.name === 'TEST_DATABASE_URL')
      ?.sensitive,
    true,
  );

  const dockerSection = contract.sections.find(
    (section) => section.scope === 'docker',
  );
  assert.equal(dockerSection?.baselineStatus, 'resolved');
  assert.deepEqual(dockerSection?.sourceFiles, ['.env.docker']);
});
