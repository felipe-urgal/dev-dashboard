import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type {
  Deployment,
  DeploymentPlanStep,
  Project,
} from '@dev-dashboard/contracts';

import { DeploymentError } from '../src/deployment/errors.js';
import {
  DeploymentService,
  type DeploymentCommandRunner,
} from '../src/deployment/service.js';
import { DeploymentStore } from '../src/deployment/store.js';

const REVISION = 'a'.repeat(40);

const project: Project = {
  id: 'project-1',
  name: 'home-music',
  path: '/tmp/home-music',
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
      backup: 'prod:backup',
      deploy: 'prod:deploy',
      verify: 'prod:verify',
    },
    policies: {
      backup: 'required-before-migration',
      migrations: 'startup',
      rollback: 'restore-backup-when-schema-changed',
    },
  },
};

function recoveryDeployment(overrides: Partial<Deployment> = {}): Deployment {
  return {
    id: 'deployment-1',
    projectId: project.id,
    projectName: project.name,
    provider: 'systemd',
    branch: 'main',
    revision: REVISION,
    planHash: 'b'.repeat(64),
    status: 'recovery_required',
    createdAt: '2026-08-31T18:00:00.000Z',
    startedAt: '2026-08-31T18:00:01.000Z',
    finishedAt: '2026-08-31T18:00:10.000Z',
    currentStepId: 'verify',
    failurePoint: 'after-irreversible',
    errorCode: 'DEPLOYMENT_COMMAND_FAILED',
    errorMessage: 'A etapa verify terminou com código 7.',
    timeline: [
      {
        id: 'check',
        script: 'prod:check',
        phase: 'preparing',
        mutating: false,
        irreversible: false,
        status: 'succeeded',
      },
      {
        id: 'backup',
        script: 'prod:backup',
        phase: 'backing_up',
        mutating: true,
        irreversible: false,
        status: 'succeeded',
      },
      {
        id: 'deploy',
        script: 'prod:deploy',
        phase: 'deploying',
        mutating: true,
        irreversible: true,
        status: 'succeeded',
      },
      {
        id: 'verify',
        script: 'prod:verify',
        phase: 'verifying',
        mutating: false,
        irreversible: false,
        status: 'failed',
        exitCode: 7,
      },
    ],
    ...overrides,
  };
}

class FixedRevisionResolver {
  public revision = REVISION;

  public async resolve() {
    return { revision: this.revision, branch: 'main' };
  }
}

class FakeRunner implements DeploymentCommandRunner {
  public readonly calls: string[] = [];
  public exitCode = 0;

  public async run(
    _project: Project,
    step: DeploymentPlanStep,
    _signal: AbortSignal,
    onOutput: Parameters<DeploymentCommandRunner['run']>[3],
  ) {
    this.calls.push(step.id);
    onOutput({
      content: `retry=${step.id}\n`,
      masked: false,
      redactionCount: 0,
    });
    return { exitCode: this.exitCode, cancelled: false };
  }
}

async function makeStore(t: test.TestContext): Promise<DeploymentStore> {
  const directory = await mkdtemp(
    path.join(tmpdir(), 'deployment-verify-retry-'),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new DeploymentStore(directory);
  await store.ready();
  return store;
}

async function waitForTerminal(
  service: DeploymentService,
  deploymentId: string,
): Promise<Deployment> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const deployment = await service.get(project.id, deploymentId);
    if (
      ['succeeded', 'recovery_required', 'failed', 'cancelled'].includes(
        deployment.status,
      )
    ) {
      return deployment;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('retry de verify não terminou dentro do limite do teste');
}

test('retry executa somente verify e conclui a execução quando a validação passa', async (t) => {
  const store = await makeStore(t);
  await store.save(recoveryDeployment());
  const runner = new FakeRunner();
  const service = new DeploymentService({
    store,
    adapter: runner,
    revisionResolver: new FixedRevisionResolver(),
  });

  const retrying = await service.retryVerify(project, 'deployment-1');
  assert.equal(retrying.status, 'verifying');
  assert.equal(retrying.timeline.at(-1)?.status, 'running');

  const completed = await waitForTerminal(service, 'deployment-1');
  assert.equal(completed.status, 'succeeded');
  assert.equal(completed.timeline.at(-1)?.status, 'succeeded');
  assert.equal(completed.errorCode, undefined);
  assert.equal(completed.failurePoint, undefined);
  assert.deepEqual(runner.calls, ['verify']);
});

test('retry que falha mantém recovery_required e não repete etapas mutantes', async (t) => {
  const store = await makeStore(t);
  await store.save(recoveryDeployment());
  const runner = new FakeRunner();
  runner.exitCode = 9;
  const service = new DeploymentService({
    store,
    adapter: runner,
    revisionResolver: new FixedRevisionResolver(),
  });

  await service.retryVerify(project, 'deployment-1');
  const failed = await waitForTerminal(service, 'deployment-1');

  assert.equal(failed.status, 'recovery_required');
  assert.equal(failed.failurePoint, 'after-irreversible');
  assert.equal(failed.timeline.at(-1)?.status, 'failed');
  assert.equal(failed.timeline.at(-1)?.exitCode, 9);
  assert.deepEqual(runner.calls, ['verify']);
});

test('retry aceita verify falho após deploy não irreversível', async (t) => {
  const store = await makeStore(t);
  const failed = recoveryDeployment({
    status: 'failed',
    failurePoint: 'before-irreversible',
    timeline: recoveryDeployment().timeline.map((step) =>
      step.id === 'deploy' ? { ...step, irreversible: false } : step,
    ),
  });
  await store.save(failed);
  const runner = new FakeRunner();
  const service = new DeploymentService({
    store,
    adapter: runner,
    revisionResolver: new FixedRevisionResolver(),
  });

  await service.retryVerify(project, failed.id);
  const completed = await waitForTerminal(service, failed.id);

  assert.equal(completed.status, 'succeeded');
  assert.deepEqual(runner.calls, ['verify']);
});

test('retry falha fechado quando o estado não prova deploy concluído + verify isolado', async (t) => {
  const store = await makeStore(t);
  const invalid = recoveryDeployment({
    timeline: recoveryDeployment().timeline.map((step) =>
      step.id === 'deploy' ? { ...step, status: 'failed' as const } : step,
    ),
  });
  await store.save(invalid);
  const service = new DeploymentService({
    store,
    adapter: new FakeRunner(),
    revisionResolver: new FixedRevisionResolver(),
  });

  await assert.rejects(
    service.retryVerify(project, 'deployment-1'),
    (error: unknown) =>
      error instanceof DeploymentError &&
      error.code === 'DEPLOYMENT_VERIFY_RETRY_NOT_AVAILABLE',
  );
});

test('retry recusa deployment antigo mesmo se a revisão voltar a coincidir', async (t) => {
  const store = await makeStore(t);
  await store.save(recoveryDeployment());
  await store.save(
    recoveryDeployment({
      id: 'deployment-2',
      createdAt: '2026-08-31T19:00:00.000Z',
    }),
  );
  const runner = new FakeRunner();
  const service = new DeploymentService({
    store,
    adapter: runner,
    revisionResolver: new FixedRevisionResolver(),
  });

  await assert.rejects(
    service.retryVerify(project, 'deployment-1'),
    (error: unknown) =>
      error instanceof DeploymentError &&
      error.code === 'DEPLOYMENT_VERIFY_RETRY_NOT_AVAILABLE',
  );
  assert.deepEqual(runner.calls, []);
});

test('retry recusa contrato que deixou de usar strategy command', async (t) => {
  const store = await makeStore(t);
  await store.save(recoveryDeployment());
  const runner = new FakeRunner();
  const gitManagedProject: Project = {
    ...project,
    production: {
      version: 1,
      enabled: true,
      strategy: 'git-managed',
      provider: 'vercel',
      branch: 'main',
      commands: {
        check: 'prod:check',
        verify: 'prod:verify',
      },
      external: { project: 'home-music' },
      policies: {
        backup: 'external',
        migrations: 'not-configured',
        rollback: 'provider-only-when-schema-compatible',
      },
    },
  };
  const service = new DeploymentService({
    store,
    adapter: runner,
    revisionResolver: new FixedRevisionResolver(),
  });

  await assert.rejects(
    service.retryVerify(gitManagedProject, 'deployment-1'),
    (error: unknown) =>
      error instanceof DeploymentError &&
      error.code === 'DEPLOYMENT_STRATEGY_UNSUPPORTED',
  );
  assert.deepEqual(runner.calls, []);
});

test('retry recusa revision diferente antes de executar qualquer comando', async (t) => {
  const store = await makeStore(t);
  await store.save(recoveryDeployment());
  const runner = new FakeRunner();
  const revisionResolver = new FixedRevisionResolver();
  revisionResolver.revision = 'c'.repeat(40);
  const service = new DeploymentService({
    store,
    adapter: runner,
    revisionResolver,
  });

  await assert.rejects(
    service.retryVerify(project, 'deployment-1'),
    (error: unknown) =>
      error instanceof DeploymentError &&
      error.code === 'DEPLOYMENT_PLAN_STALE',
  );
  assert.deepEqual(runner.calls, []);
});
