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
      scripts: { 'prod:check': 'echo ok' },
    }),
  );
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
        deploy: 'prod:deploy',
        verify: 'prod:verify',
      },
      policies: {
        backup: 'none',
        migrations: 'startup',
        rollback: 'manual',
      },
    },
  } as Project;
}

const checkStep = {
  id: 'check' as const,
  script: 'prod:check',
  phase: 'preparing' as const,
  mutating: false,
  irreversible: false,
};

test('command adapter mantém ambiente herdado quando arquivo de produção não existe', async (t) => {
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

test('command adapter carrega .dev-dashboard/.env.production.local e prioriza valores do projeto', async (t) => {
  const directory = await temporaryProject(t);
  await mkdir(path.join(directory, '.dev-dashboard'));
  await writeFile(
    path.join(directory, '.dev-dashboard', '.env.production.local'),
    [
      'DATABASE_URL="postgresql://production.example/app"',
      'DEV_DASHBOARD_ENV_OVERRIDE=valor-do-projeto',
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
    checkStep,
    new AbortController().signal,
    () => undefined,
  );

  assert.equal(result.exitCode, 0);
  assert.equal(databaseUrl, 'postgresql://production.example/app');
  assert.equal(overrideValue, 'valor-do-projeto');
  assert.equal(process.env.DEV_DASHBOARD_ENV_OVERRIDE, 'valor-do-dashboard');
});

test('command adapter falha fechado para arquivo de ambiente inválido antes de iniciar processo', async (t) => {
  const directory = await temporaryProject(t);
  await mkdir(path.join(directory, '.dev-dashboard'));
  await mkdir(path.join(directory, '.dev-dashboard', '.env.production.local'));

  let spawned = false;
  const adapter = new ProductionCommandAdapter({
    spawnProcess: (() => {
      spawned = true;
      return new FakeChild() as never;
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
      /ambiente local de produção/i.test(error.message),
  );
  assert.equal(spawned, false);
});
