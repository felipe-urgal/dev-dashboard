import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

import { ProductionCommandAdapter } from '../src/deployment/command-adapter.js';
import { DeploymentError } from '../src/deployment/errors.js';

class FakeChild extends EventEmitter {
  public stdout = new EventEmitter();
  public stderr = new EventEmitter();

  public kill(): boolean {
    return true;
  }
}

async function temporaryProject(t: test.TestContext): Promise<string> {
  const directory = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-production-env-'),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(
    path.join(directory, 'package.json'),
    JSON.stringify({
      packageManager: 'npm@11.0.0',
      scripts: {
        'prod:check': 'echo ok',
        'prod:migrate': 'echo migrate',
      },
    }),
  );
  return directory;
}

async function ensureDashboardDirectory(projectPath: string): Promise<string> {
  const directory = path.join(projectPath, '.dev-dashboard');
  await mkdir(directory, { recursive: true });
  return directory;
}

function makeProject(projectPath: string): Project {
  return {
    id: 'project-production-env',
    name: 'project-production-env',
    path: projectPath,
    type: 'node',
    source: 'standalone',
    enabled: true,
    capabilities: ['production'],
    production: {
      version: 1,
      enabled: true,
      strategy: 'command',
      provider: 'systemd',
      branch: 'main',
      commands: {
        status: 'prod:status',
        check: 'prod:check',
        migrate: 'prod:migrate',
        deploy: 'prod:deploy',
        verify: 'prod:verify',
      },
      policies: {
        backup: 'required-before-migration',
        migrations: 'before-deploy',
        rollback: 'restore-backup-when-schema-changed',
      },
    },
  };
}

const checkStep = {
  id: 'check' as const,
  script: 'prod:check',
  phase: 'preparing' as const,
  mutating: false,
  irreversible: false,
};

const migrateStep = {
  id: 'migrate' as const,
  script: 'prod:migrate',
  phase: 'migrating' as const,
  mutating: true,
  irreversible: true,
};

test('command adapter mantém ambiente herdado quando arquivos locais não existem', async (t) => {
  const directory = await temporaryProject(t);
  const previous = process.env.DEV_DASHBOARD_ENV_TEST;
  process.env.DEV_DASHBOARD_ENV_TEST = 'herdado-do-dashboard';
  t.after(() => {
    if (previous === undefined) delete process.env.DEV_DASHBOARD_ENV_TEST;
    else process.env.DEV_DASHBOARD_ENV_TEST = previous;
  });

  const child = new FakeChild();
  let inheritedValue: string | undefined;
  const adapter = new ProductionCommandAdapter({
    spawnProcess: ((_file, _args, options) => {
      inheritedValue = options.env.DEV_DASHBOARD_ENV_TEST;
      queueMicrotask(() => child.emit('close', 0));
      return child as never;
    }) as never,
  });

  const result = await adapter.run(
    makeProject(directory),
    checkStep,
    new AbortController().signal,
    () => undefined,
  );

  assert.equal(result.exitCode, 0);
  assert.equal(inheritedValue, 'herdado-do-dashboard');
});

test('prod:check carrega .env.check.local e não injeta .env.production.local', async (t) => {
  const directory = await temporaryProject(t);
  const dashboardDirectory = await ensureDashboardDirectory(directory);
  await writeFile(
    path.join(dashboardDirectory, '.env.check.local'),
    [
      'DATABASE_URL="postgresql://test.example/app"',
      'DEV_DASHBOARD_ENV_OVERRIDE=valor-check',
      '',
    ].join('\n'),
  );
  await writeFile(
    path.join(dashboardDirectory, '.env.production.local'),
    [
      'DATABASE_URL="postgresql://production.example/app"',
      'DEV_DASHBOARD_ENV_OVERRIDE=valor-producao',
      '',
    ].join('\n'),
  );

  const previousDatabaseUrl = process.env.DATABASE_URL;
  const previousOverride = process.env.DEV_DASHBOARD_ENV_OVERRIDE;
  process.env.DATABASE_URL = 'postgresql://dashboard.example/app';
  process.env.DEV_DASHBOARD_ENV_OVERRIDE = 'valor-do-dashboard';
  t.after(() => {
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
    if (previousOverride === undefined) delete process.env.DEV_DASHBOARD_ENV_OVERRIDE;
    else process.env.DEV_DASHBOARD_ENV_OVERRIDE = previousOverride;
  });

  const child = new FakeChild();
  let databaseUrl: string | undefined;
  let overrideValue: string | undefined;
  const adapter = new ProductionCommandAdapter({
    spawnProcess: ((_file, _args, options) => {
      databaseUrl = options.env.DATABASE_URL;
      overrideValue = options.env.DEV_DASHBOARD_ENV_OVERRIDE;
      queueMicrotask(() => child.emit('close', 0));
      return child as never;
    }) as never,
  });

  const result = await adapter.run(
    makeProject(directory),
    checkStep,
    new AbortController().signal,
    () => undefined,
  );

  assert.equal(result.exitCode, 0);
  assert.equal(databaseUrl, 'postgresql://test.example/app');
  assert.equal(overrideValue, 'valor-check');
  assert.equal(process.env.DATABASE_URL, 'postgresql://dashboard.example/app');
  assert.equal(process.env.DEV_DASHBOARD_ENV_OVERRIDE, 'valor-do-dashboard');
});

test('prod:migrate carrega .env.production.local e não injeta .env.check.local', async (t) => {
  const directory = await temporaryProject(t);
  const dashboardDirectory = await ensureDashboardDirectory(directory);
  await writeFile(
    path.join(dashboardDirectory, '.env.check.local'),
    [
      'DATABASE_URL="postgresql://test.example/app"',
      'DEV_DASHBOARD_ENV_OVERRIDE=valor-check',
      '',
    ].join('\n'),
  );
  await writeFile(
    path.join(dashboardDirectory, '.env.production.local'),
    [
      'DATABASE_URL="postgresql://production.example/app"',
      'DEV_DASHBOARD_ENV_OVERRIDE=valor-producao',
      '',
    ].join('\n'),
  );

  const previous = process.env.DEV_DASHBOARD_ENV_OVERRIDE;
  process.env.DEV_DASHBOARD_ENV_OVERRIDE = 'valor-do-dashboard';
  t.after(() => {
    if (previous === undefined) delete process.env.DEV_DASHBOARD_ENV_OVERRIDE;
    else process.env.DEV_DASHBOARD_ENV_OVERRIDE = previous;
  });

  const child = new FakeChild();
  let databaseUrl: string | undefined;
  let overrideValue: string | undefined;
  const adapter = new ProductionCommandAdapter({
    spawnProcess: ((_file, _args, options) => {
      databaseUrl = options.env.DATABASE_URL;
      overrideValue = options.env.DEV_DASHBOARD_ENV_OVERRIDE;
      queueMicrotask(() => child.emit('close', 0));
      return child as never;
    }) as never,
  });

  const result = await adapter.run(
    makeProject(directory),
    migrateStep,
    new AbortController().signal,
    () => undefined,
  );

  assert.equal(result.exitCode, 0);
  assert.equal(databaseUrl, 'postgresql://production.example/app');
  assert.equal(overrideValue, 'valor-producao');
  assert.equal(process.env.DEV_DASHBOARD_ENV_OVERRIDE, 'valor-do-dashboard');
});

test('arquivo de check inválido bloqueia check sem afetar migrate', async (t) => {
  const directory = await temporaryProject(t);
  const dashboardDirectory = await ensureDashboardDirectory(directory);
  await mkdir(path.join(dashboardDirectory, '.env.check.local'));
  await writeFile(
    path.join(dashboardDirectory, '.env.production.local'),
    'DATABASE_URL="postgresql://production.example/app"\n',
  );

  let spawnCount = 0;
  const adapter = new ProductionCommandAdapter({
    spawnProcess: (() => {
      spawnCount += 1;
      const child = new FakeChild();
      queueMicrotask(() => child.emit('close', 0));
      return child as never;
    }) as never,
  });

  await assert.rejects(
    adapter.run(
      makeProject(directory),
      checkStep,
      new AbortController().signal,
      () => undefined,
    ),
    (error: unknown) =>
      error instanceof DeploymentError &&
      error.code === 'DEPLOYMENT_PRODUCTION_UNAVAILABLE' &&
      /ambiente local de check/i.test(error.message),
  );
  assert.equal(spawnCount, 0);

  const migrateResult = await adapter.run(
    makeProject(directory),
    migrateStep,
    new AbortController().signal,
    () => undefined,
  );
  assert.equal(migrateResult.exitCode, 0);
  assert.equal(spawnCount, 1);
});

test('arquivo de produção inválido não afeta check, mas bloqueia migrate', async (t) => {
  const directory = await temporaryProject(t);
  const dashboardDirectory = await ensureDashboardDirectory(directory);
  await writeFile(
    path.join(dashboardDirectory, '.env.check.local'),
    'DATABASE_URL="postgresql://test.example/app"\n',
  );
  await mkdir(path.join(dashboardDirectory, '.env.production.local'));

  let spawnCount = 0;
  const adapter = new ProductionCommandAdapter({
    spawnProcess: (() => {
      spawnCount += 1;
      const child = new FakeChild();
      queueMicrotask(() => child.emit('close', 0));
      return child as never;
    }) as never,
  });

  const checkResult = await adapter.run(
    makeProject(directory),
    checkStep,
    new AbortController().signal,
    () => undefined,
  );
  assert.equal(checkResult.exitCode, 0);
  assert.equal(spawnCount, 1);

  await assert.rejects(
    adapter.run(
      makeProject(directory),
      migrateStep,
      new AbortController().signal,
      () => undefined,
    ),
    (error: unknown) =>
      error instanceof DeploymentError &&
      error.code === 'DEPLOYMENT_PRODUCTION_UNAVAILABLE' &&
      /ambiente local de produção/i.test(error.message),
  );
  assert.equal(spawnCount, 1);
});
