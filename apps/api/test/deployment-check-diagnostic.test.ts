import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';

import type { DeploymentPlanStep, Project } from '@dev-dashboard/contracts';

import { ProductionCommandAdapter } from '../src/deployment/command-adapter.js';
import { DeploymentError } from '../src/deployment/errors.js';

function makeProject(projectPath: string): Project {
  return {
    id: 'project-1',
    name: 'Projeto de teste',
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
        backup: 'not-configured',
        migrations: 'not-configured',
        rollback: 'manual-restore',
      },
    },
  };
}

function checkStep(): DeploymentPlanStep {
  return {
    id: 'check',
    script: 'prod:check',
    phase: 'preparing',
    mutating: false,
    irreversible: false,
  };
}

function deployStep(): DeploymentPlanStep {
  return {
    id: 'deploy',
    script: 'prod:deploy',
    phase: 'deploying',
    mutating: true,
    irreversible: false,
  };
}

function spawnWithFailure(stderr: string, exitCode = 1) {
  return () => {
    const child = new EventEmitter() as EventEmitter & {
      stdout: PassThrough;
      stderr: PassThrough;
      kill: (signal?: NodeJS.Signals) => boolean;
    };
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = () => true;

    queueMicrotask(() => {
      child.stderr.write(stderr);
      child.stderr.end();
      child.emit('close', exitCode);
    });

    return child as never;
  };
}

async function temporaryProject(t: test.TestContext): Promise<string> {
  const directory = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-check-diagnostic-'),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(
    path.join(directory, 'package.json'),
    JSON.stringify({ name: 'project-test', packageManager: 'npm@11.0.0' }),
  );
  return directory;
}

test('classifica Prisma P1001 no prod:check sem repetir detalhes do stderr', async (t) => {
  const projectPath = await temporaryProject(t);
  const sensitiveHost = 'postgres-check.internal:55432';
  const outputs: string[] = [];
  const adapter = new ProductionCommandAdapter({
    spawnProcess: spawnWithFailure(
      `PrismaClientInitializationError: P1001: Can't reach database server at ${sensitiveHost}`,
    ),
  });

  await assert.rejects(
    adapter.run(
      makeProject(projectPath),
      checkStep(),
      new AbortController().signal,
      (output) => outputs.push(output.content),
    ),
    (error: unknown) => {
      assert.ok(error instanceof DeploymentError);
      assert.equal(error.code, 'DEPLOYMENT_CHECK_DATABASE_UNAVAILABLE');
      assert.match(error.message, /ambiente de check/i);
      assert.match(error.message, /não inicia esse serviço automaticamente/i);
      assert.doesNotMatch(error.message, /postgres-check\.internal|55432/i);
      return true;
    },
  );

  const diagnostic = outputs.find((content) => content.includes('[Dev Dashboard]'));
  assert.ok(diagnostic);
  assert.match(diagnostic, /ambiente de check/i);
  assert.doesNotMatch(diagnostic, /postgres-check\.internal|55432/i);
});

test('não classifica erro genérico do prod:check como indisponibilidade de banco', async (t) => {
  const projectPath = await temporaryProject(t);
  const adapter = new ProductionCommandAdapter({
    spawnProcess: spawnWithFailure('RSpec: 2 examples, 1 failure', 7),
  });

  const result = await adapter.run(
    makeProject(projectPath),
    checkStep(),
    new AbortController().signal,
    () => undefined,
  );

  assert.deepEqual(result, { exitCode: 7, cancelled: false });
});

test('não promove P1001 fora do prod:check para diagnóstico de ambiente de check', async (t) => {
  const projectPath = await temporaryProject(t);
  const adapter = new ProductionCommandAdapter({
    spawnProcess: spawnWithFailure('P1001: database unavailable', 3),
  });

  const result = await adapter.run(
    makeProject(projectPath),
    deployStep(),
    new AbortController().signal,
    () => undefined,
  );

  assert.deepEqual(result, { exitCode: 3, cancelled: false });
});
