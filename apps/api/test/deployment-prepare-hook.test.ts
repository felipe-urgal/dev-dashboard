import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

import { ProductionCommandAdapter } from '../src/deployment/command-adapter.js';
import { DeploymentPlanner } from '../src/deployment/planner.js';

const REVISION = 'a'.repeat(40);

class FakeChild extends EventEmitter {
  public stdout = new EventEmitter();
  public stderr = new EventEmitter();

  public kill(): boolean {
    return true;
  }
}

function project(
  projectPath: string,
  prepare: boolean,
  strategy: 'command' | 'git-managed' = 'command',
): Project {
  return {
    id: 'project-prepare',
    name: 'project-prepare',
    path: projectPath,
    type: 'node',
    source: 'standalone',
    enabled: true,
    capabilities: ['production'],
    production: {
      version: 1,
      enabled: true,
      strategy,
      provider: strategy === 'command' ? 'systemd' : 'vercel',
      branch: 'main',
      commands:
        strategy === 'command'
          ? {
              ...(prepare ? { prepare: 'prod:prepare' as const } : {}),
              status: 'prod:status',
              check: 'prod:check',
              deploy: 'prod:deploy',
              verify: 'prod:verify',
            }
          : {
              ...(prepare ? { prepare: 'prod:prepare' as const } : {}),
              check: 'prod:check',
              verify: 'prod:verify',
            },
      ...(strategy === 'git-managed'
        ? { external: { project: 'project-prepare' } }
        : {}),
      policies: {
        backup: strategy === 'command' ? 'not-configured' : 'external',
        migrations: 'not-configured',
        rollback:
          strategy === 'command'
            ? 'manual-restore'
            : 'provider-only-when-schema-compatible',
      },
    },
  };
}

test('planner incorpora prepare no check sem alterar o fluxo quando hook não existe', () => {
  const planner = new DeploymentPlanner(() => 0);
  const revision = { branch: 'main', revision: REVISION };

  const withoutPrepare = planner.build(project('/tmp/project', false), revision);
  const withPrepare = planner.build(project('/tmp/project', true), revision);

  assert.deepEqual(
    withoutPrepare.steps.map((step) => step.id),
    ['check', 'deploy', 'verify'],
  );
  assert.equal(withoutPrepare.steps[0]?.id, 'check');
  if (withoutPrepare.steps[0]?.id === 'check') {
    assert.equal(withoutPrepare.steps[0].prepareScript, undefined);
  }

  assert.deepEqual(
    withPrepare.steps.map((step) => step.id),
    ['check', 'deploy', 'verify'],
  );
  assert.equal(withPrepare.steps[0]?.id, 'check');
  if (withPrepare.steps[0]?.id === 'check') {
    assert.equal(withPrepare.steps[0].prepareScript, 'prod:prepare');
  }
  assert.notEqual(withPrepare.planHash, withoutPrepare.planHash);
});

test('planner também incorpora prepare antes do check no fluxo git-managed', () => {
  const planner = new DeploymentPlanner(() => 0);
  const plan = planner.build(project('/tmp/project', true, 'git-managed'), {
    branch: 'main',
    revision: REVISION,
  });

  assert.deepEqual(
    plan.steps.map((step) => step.id),
    ['check', 'provider-deploy', 'verify'],
  );
  const check = plan.steps[0];
  assert.equal(check?.id, 'check');
  if (check?.id === 'check') {
    assert.equal(check.prepareScript, 'prod:prepare');
    assert.equal(check.providerPreflight?.revision, REVISION);
  }
});

test('adapter executa prepare antes de check usando o ambiente local de check', async (t) => {
  const projectPath = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-prepare-adapter-'),
  );
  t.after(() => rm(projectPath, { recursive: true, force: true }));
  await mkdir(path.join(projectPath, '.dev-dashboard'));
  await writeFile(
    path.join(projectPath, 'package.json'),
    JSON.stringify({
      packageManager: 'npm@11.0.0',
      scripts: {
        'prod:prepare': 'echo prepare',
        'prod:check': 'echo check',
      },
    }),
  );
  await writeFile(
    path.join(projectPath, '.dev-dashboard', '.env.check.local'),
    'DEV_DASHBOARD_PREPARE_ENV=check\n',
  );
  await writeFile(
    path.join(projectPath, '.dev-dashboard', '.env.production.local'),
    'DEV_DASHBOARD_PREPARE_ENV=production\n',
  );

  const calls: Array<{ script: string; environment?: string }> = [];
  const adapter = new ProductionCommandAdapter({
    spawnProcess: ((_file, args, options) => {
      const child = new FakeChild();
      calls.push({
        script: args[1] ?? '',
        environment: options.env.DEV_DASHBOARD_PREPARE_ENV,
      });
      queueMicrotask(() => child.emit('close', 0));
      return child as never;
    }) as never,
  });
  const plan = new DeploymentPlanner(() => 0).build(
    project(projectPath, true),
    { branch: 'main', revision: REVISION },
  );

  const result = await adapter.run(
    project(projectPath, true),
    plan.steps[0]!,
    new AbortController().signal,
    () => undefined,
  );

  assert.deepEqual(calls, [
    { script: 'prod:prepare', environment: 'check' },
    { script: 'prod:check', environment: 'check' },
  ]);
  assert.deepEqual(result, { exitCode: 0, cancelled: false });
});

test('falha no prepare interrompe a etapa antes de executar check', async (t) => {
  const projectPath = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-prepare-failure-'),
  );
  t.after(() => rm(projectPath, { recursive: true, force: true }));
  await writeFile(
    path.join(projectPath, 'package.json'),
    JSON.stringify({ packageManager: 'npm@11.0.0' }),
  );

  const calls: string[] = [];
  const adapter = new ProductionCommandAdapter({
    spawnProcess: ((_file, args) => {
      const child = new FakeChild();
      calls.push(args[1] ?? '');
      queueMicrotask(() => child.emit('close', calls.length === 1 ? 7 : 0));
      return child as never;
    }) as never,
  });
  const plan = new DeploymentPlanner(() => 0).build(
    project(projectPath, true),
    { branch: 'main', revision: REVISION },
  );

  const result = await adapter.run(
    project(projectPath, true),
    plan.steps[0]!,
    new AbortController().signal,
    () => undefined,
  );

  assert.deepEqual(calls, ['prod:prepare']);
  assert.deepEqual(result, { exitCode: 7, cancelled: false });
});
