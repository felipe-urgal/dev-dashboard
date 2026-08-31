import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type {
  Deployment,
  DeploymentPlanStep,
  Project,
} from '@dev-dashboard/contracts';

import { ProductionCommandAdapter } from '../src/deployment/command-adapter.js';
import { DeploymentConfirmationService } from '../src/deployment/confirmation.js';
import { DeploymentError } from '../src/deployment/errors.js';
import { DeploymentPlanner } from '../src/deployment/planner.js';
import { GitDeploymentRevisionResolver } from '../src/deployment/revision.js';
import {
  DeploymentService,
  type DeploymentCommandRunner,
} from '../src/deployment/service.js';
import { DeploymentStore } from '../src/deployment/store.js';

const REVISION_A = 'a'.repeat(40);
const REVISION_B = 'b'.repeat(40);

function makeProject(
  overrides: Partial<NonNullable<Project['production']>> = {},
): Project {
  return {
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
      ...overrides,
    },
  };
}

async function temporaryDirectory(t: test.TestContext): Promise<string> {
  const directory = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-deployment-'),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

async function waitForTerminal(
  service: DeploymentService,
  deployment: Deployment,
): Promise<Deployment> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const current = await service.get(deployment.projectId, deployment.id);
    if (
      ['succeeded', 'failed', 'recovery_required', 'cancelled'].includes(
        current.status,
      )
    ) {
      return current;
    }
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  throw new Error('deployment não terminou dentro do limite do teste');
}

class FixedRevisionResolver {
  public revision = REVISION_A;
  public branch = 'main';

  public async resolve() {
    return { revision: this.revision, branch: this.branch };
  }
}

class FakeRunner implements DeploymentCommandRunner {
  public readonly calls: string[] = [];
  public failOn: string | undefined;
  public block = false;
  private releaseBlocking: (() => void) | undefined;

  public async run(
    _project: Project,
    step: DeploymentPlanStep,
    signal: AbortSignal,
    onOutput: Parameters<DeploymentCommandRunner['run']>[3],
  ) {
    this.calls.push(step.id);
    onOutput({
      content: `step=${step.id}\n`,
      masked: false,
      redactionCount: 0,
    });

    if (this.block) {
      if (!signal.aborted) {
        await new Promise<void>((resolve) => {
          this.releaseBlocking = resolve;
          signal.addEventListener('abort', resolve, { once: true });
        });
      }
      return { exitCode: signal.aborted ? 1 : 0, cancelled: signal.aborted };
    }

    if (this.failOn === step.id) return { exitCode: 7, cancelled: false };
    return { exitCode: 0, cancelled: false };
  }

  public release(): void {
    this.releaseBlocking?.();
  }
}

function makeDeployment(id = 'deployment-1'): Deployment {
  return {
    id,
    projectId: 'project-1',
    projectName: 'home-music',
    provider: 'systemd',
    branch: 'main',
    revision: REVISION_A,
    planHash: 'c'.repeat(64),
    status: 'planned',
    createdAt: '2026-08-31T12:00:00.000Z',
    timeline: [
      {
        id: 'check',
        script: 'prod:check',
        phase: 'preparing',
        mutating: false,
        irreversible: false,
        status: 'pending',
      },
    ],
  };
}

test('planner monta Home Music com backup antes do deploy e marca deploy/startup como irreversível', () => {
  const planner = new DeploymentPlanner(() =>
    Date.parse('2026-08-31T12:00:00Z'),
  );
  const plan = planner.build(makeProject(), {
    revision: REVISION_A,
    branch: 'main',
  });

  assert.deepEqual(
    plan.steps.map((step) => step.id),
    ['check', 'backup', 'deploy', 'verify'],
  );
  assert.equal(plan.steps[2]?.irreversible, true);
  assert.equal(plan.steps[2]?.mutating, true);
  assert.match(plan.planHash, /^[0-9a-f]{64}$/);
  assert.equal(plan.revision, REVISION_A);
});

test('planner inclui migrate explícito antes do deploy e o torna irreversível', () => {
  const project = makeProject({
    commands: {
      status: 'prod:status',
      check: 'prod:check',
      backup: 'prod:backup',
      migrate: 'prod:migrate',
      deploy: 'prod:deploy',
      verify: 'prod:verify',
    },
    policies: {
      backup: 'required-before-deploy',
      migrations: 'before-deploy',
      rollback: 'manual-restore',
    },
  });
  const plan = new DeploymentPlanner().build(project, {
    revision: REVISION_A,
    branch: 'main',
  });

  assert.deepEqual(
    plan.steps.map((step) => step.id),
    ['check', 'backup', 'migrate', 'deploy', 'verify'],
  );
  assert.equal(plan.steps[2]?.irreversible, true);
  assert.equal(plan.steps[3]?.irreversible, false);
});

test('planner falha fechado para branch errada, strategy externa e políticas sem scripts obrigatórios', () => {
  const planner = new DeploymentPlanner();
  assert.throws(
    () =>
      planner.build(makeProject(), {
        revision: REVISION_A,
        branch: 'feature/x',
      }),
    (error: unknown) =>
      error instanceof DeploymentError &&
      error.code === 'DEPLOYMENT_BRANCH_MISMATCH',
  );

  assert.throws(
    () =>
      planner.build(
        makeProject({ strategy: 'git-managed', provider: 'vercel' }),
        { revision: REVISION_A, branch: 'main' },
      ),
    (error: unknown) =>
      error instanceof DeploymentError &&
      error.code === 'DEPLOYMENT_STRATEGY_UNSUPPORTED',
  );

  assert.throws(
    () =>
      planner.build(
        makeProject({
          commands: {
            status: 'prod:status',
            check: 'prod:check',
            deploy: 'prod:deploy',
            verify: 'prod:verify',
          },
        }),
        { revision: REVISION_A, branch: 'main' },
      ),
    (error: unknown) =>
      error instanceof DeploymentError &&
      error.code === 'DEPLOYMENT_BACKUP_REQUIRED',
  );

  assert.throws(
    () =>
      planner.build(
        makeProject({
          commands: {
            status: 'prod:status',
            check: 'prod:check',
            backup: 'prod:backup',
            deploy: 'prod:deploy',
            verify: 'prod:verify',
          },
          policies: {
            backup: 'required-before-deploy',
            migrations: 'before-deploy',
            rollback: 'manual-restore',
          },
        }),
        { revision: REVISION_A, branch: 'main' },
      ),
    (error: unknown) =>
      error instanceof DeploymentError &&
      error.code === 'DEPLOYMENT_MIGRATION_COMMAND_REQUIRED',
  );
});

test('planner não cria produção para capability ausente ou produção desabilitada', () => {
  const planner = new DeploymentPlanner();
  const withoutCapability = makeProject();
  withoutCapability.capabilities = [];
  assert.throws(
    () =>
      planner.build(withoutCapability, {
        revision: REVISION_A,
        branch: 'main',
      }),
    /produção habilitada e válida/i,
  );

  const disabled = makeProject({
    enabled: false,
    strategy: 'disabled',
    provider: 'none',
  });
  assert.throws(
    () => planner.build(disabled, { revision: REVISION_A, branch: 'main' }),
    /produção habilitada e válida/i,
  );
});

test('confirmação fica vinculada a projeto + revision + hash e é de uso único', () => {
  let now = 1_000;
  const service = new DeploymentConfirmationService(500, () => now);
  const plan = new DeploymentPlanner(() => now).build(makeProject(), {
    revision: REVISION_A,
    branch: 'main',
  });
  const confirmation = service.prepare(plan);

  assert.equal(confirmation.projectId, plan.projectId);
  assert.equal(confirmation.revision, plan.revision);
  assert.equal(confirmation.planHash, plan.planHash);
  assert.throws(
    () =>
      service.consume({ ...plan, revision: REVISION_B }, confirmation.token),
    /Confirmação válida/i,
  );
  service.consume(plan, confirmation.token);
  assert.throws(
    () => service.consume(plan, confirmation.token),
    /Confirmação válida/i,
  );

  const expiring = service.prepare(plan);
  now += 501;
  assert.throws(
    () => service.consume(plan, expiring.token),
    /Confirmação válida/i,
  );
});

test('store persiste histórico, limita log UTF-8 e recupera execução interrompida', async (t) => {
  const directory = await temporaryDirectory(t);
  const store = new DeploymentStore(directory, {
    historyLimit: 2,
    logLimitBytes: 8,
  });
  const deployment = {
    ...makeDeployment(),
    status: 'deploying' as const,
    timeline: [
      {
        ...makeDeployment().timeline[0]!,
        id: 'deploy' as const,
        script: 'prod:deploy',
        phase: 'deploying' as const,
        mutating: true,
        irreversible: true,
        status: 'succeeded' as const,
      },
      {
        ...makeDeployment().timeline[0]!,
        id: 'verify' as const,
        script: 'prod:verify',
        phase: 'verifying' as const,
        status: 'running' as const,
      },
    ],
  };
  await store.save(deployment);
  await store.appendLog(deployment.id, {
    content: '😀abcdefgh',
    masked: true,
    redactionCount: 2,
  });

  const log = await store.log(deployment.id);
  assert.ok(Buffer.byteLength(log.content, 'utf8') <= 8);
  assert.equal(log.truncated, true);
  assert.equal(log.masked, true);
  assert.equal(log.redactionCount, 2);
  assert.doesNotMatch(log.content, /�/);

  await store.recoverInterrupted(Date.parse('2026-08-31T13:00:00Z'));
  const recovered = await store.get(deployment.id);
  assert.equal(recovered?.status, 'recovery_required');
  assert.equal(recovered?.failurePoint, 'after-irreversible');
  assert.equal(recovered?.timeline[1]?.status, 'failed');

  await store.save({
    ...makeDeployment('deployment-2'),
    createdAt: '2026-08-31T14:00:00Z',
  });
  await store.save({
    ...makeDeployment('deployment-3'),
    createdAt: '2026-08-31T15:00:00Z',
  });
  const history = await store.history('project-1', 1, 20);
  assert.deepEqual(
    history.items.map((item) => item.id),
    ['deployment-3', 'deployment-2'],
  );

  const restored = new DeploymentStore(directory, {
    historyLimit: 2,
    logLimitBytes: 8,
  });
  await restored.ready();
  assert.equal((await restored.history('project-1')).total, 2);
});

test('service executa check → backup → deploy → verify, persiste log e conclui succeeded', async (t) => {
  const directory = await temporaryDirectory(t);
  const runner = new FakeRunner();
  const service = new DeploymentService({
    revisionResolver: new FixedRevisionResolver(),
    adapter: runner,
    store: new DeploymentStore(directory),
  });
  const project = makeProject();
  const plan = await service.plan(project);
  const confirmation = await service.prepareConfirmation(
    project,
    plan.planHash,
  );
  const started = await service.start(
    project,
    plan.planHash,
    confirmation.token,
  );
  const finished = await waitForTerminal(service, started);

  assert.equal(finished.status, 'succeeded');
  assert.deepEqual(runner.calls, ['check', 'backup', 'deploy', 'verify']);
  assert.ok(finished.timeline.every((step) => step.status === 'succeeded'));
  assert.match(
    (await service.log(project.id, started.id)).content,
    /step=deploy/,
  );
  assert.equal((await service.history(project.id)).total, 1);
});

test('falha antes de etapa irreversível termina failed; falha durante etapa irreversível exige recovery', async (t) => {
  const directory = await temporaryDirectory(t);
  const revisionResolver = new FixedRevisionResolver();
  const beforeRunner = new FakeRunner();
  beforeRunner.failOn = 'check';
  const beforeService = new DeploymentService({
    revisionResolver,
    adapter: beforeRunner,
    store: new DeploymentStore(path.join(directory, 'before')),
  });
  const project = makeProject();
  const beforePlan = await beforeService.plan(project);
  const beforeConfirmation = await beforeService.prepareConfirmation(
    project,
    beforePlan.planHash,
  );
  const before = await waitForTerminal(
    beforeService,
    await beforeService.start(
      project,
      beforePlan.planHash,
      beforeConfirmation.token,
    ),
  );
  assert.equal(before.status, 'failed');
  assert.equal(before.failurePoint, 'before-irreversible');

  const riskyRunner = new FakeRunner();
  riskyRunner.failOn = 'deploy';
  const riskyService = new DeploymentService({
    revisionResolver,
    adapter: riskyRunner,
    store: new DeploymentStore(path.join(directory, 'risky')),
  });
  const riskyPlan = await riskyService.plan(project);
  const riskyConfirmation = await riskyService.prepareConfirmation(
    project,
    riskyPlan.planHash,
  );
  const risky = await waitForTerminal(
    riskyService,
    await riskyService.start(
      project,
      riskyPlan.planHash,
      riskyConfirmation.token,
    ),
  );
  assert.equal(risky.status, 'recovery_required');
  assert.equal(risky.failurePoint, 'after-irreversible');
  assert.equal(risky.errorCode, 'DEPLOYMENT_COMMAND_FAILED');
});

test('service rejeita plano stale e uma segunda execução concorrente global', async (t) => {
  const directory = await temporaryDirectory(t);
  const revisions = new FixedRevisionResolver();
  const runner = new FakeRunner();
  runner.block = true;
  const service = new DeploymentService({
    revisionResolver: revisions,
    adapter: runner,
    store: new DeploymentStore(directory),
  });
  const project = makeProject();
  const oldPlan = await service.plan(project);
  const oldConfirmation = await service.prepareConfirmation(
    project,
    oldPlan.planHash,
  );
  revisions.revision = REVISION_B;
  await assert.rejects(
    service.start(project, oldPlan.planHash, oldConfirmation.token),
    (error: unknown) =>
      error instanceof DeploymentError &&
      error.code === 'DEPLOYMENT_PLAN_STALE',
  );

  const currentPlan = await service.plan(project);
  const currentConfirmation = await service.prepareConfirmation(
    project,
    currentPlan.planHash,
  );
  const active = await service.start(
    project,
    currentPlan.planHash,
    currentConfirmation.token,
  );

  const secondConfirmation = await service.prepareConfirmation(
    project,
    currentPlan.planHash,
  );
  await assert.rejects(
    service.start(project, currentPlan.planHash, secondConfirmation.token),
    (error: unknown) =>
      error instanceof DeploymentError &&
      error.code === 'DEPLOYMENT_ALREADY_RUNNING',
  );

  await service.cancel(project.id, active.id);
  const cancelled = await waitForTerminal(service, active);
  assert.equal(cancelled.status, 'cancelled');
  runner.release();
});

test('cancelamento durante etapa irreversível não finge rollback e vira recovery_required', async (t) => {
  const directory = await temporaryDirectory(t);
  class DeployBlockingRunner extends FakeRunner {
    public override async run(
      project: Project,
      step: DeploymentPlanStep,
      signal: AbortSignal,
      onOutput: Parameters<DeploymentCommandRunner['run']>[3],
    ) {
      if (step.id !== 'deploy')
        return super.run(project, step, signal, onOutput);
      this.calls.push(step.id);
      await new Promise<void>((resolve) =>
        signal.addEventListener('abort', resolve, { once: true }),
      );
      return { exitCode: 1, cancelled: true };
    }
  }

  const runner = new DeployBlockingRunner();
  const service = new DeploymentService({
    revisionResolver: new FixedRevisionResolver(),
    adapter: runner,
    store: new DeploymentStore(directory),
  });
  const project = makeProject();
  const plan = await service.plan(project);
  const confirmation = await service.prepareConfirmation(
    project,
    plan.planHash,
  );
  const started = await service.start(
    project,
    plan.planHash,
    confirmation.token,
  );

  for (let attempt = 0; attempt < 200; attempt += 1) {
    const current = await service.get(project.id, started.id);
    if (current.status === 'deploying') break;
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  await service.cancel(project.id, started.id);
  const finished = await waitForTerminal(service, started);
  assert.equal(finished.status, 'recovery_required');
  assert.equal(finished.failurePoint, 'after-irreversible');
  assert.equal(
    finished.timeline.find((step) => step.id === 'deploy')?.status,
    'cancelled',
  );
});

class FakeChild extends EventEmitter {
  public stdout = new EventEmitter();
  public stderr = new EventEmitter();
  public readonly kills: string[] = [];

  public kill(signal?: NodeJS.Signals | number): boolean {
    this.kills.push(String(signal ?? 'default'));
    return true;
  }
}

test('command adapter resolve programa no backend, usa shell:false e mascara segredo antes de entregar log', async (t) => {
  const directory = await temporaryDirectory(t);
  await writeFile(
    path.join(directory, 'package.json'),
    JSON.stringify({
      packageManager: 'npm@11.0.0',
      scripts: { 'prod:check': 'echo ok' },
    }),
  );
  const child = new FakeChild();
  let invocation:
    | { file: string; args: readonly string[]; cwd: string; shell: false }
    | undefined;
  const adapter = new ProductionCommandAdapter({
    spawnProcess: ((file, args, options) => {
      invocation = { file, args, cwd: options.cwd, shell: options.shell };
      queueMicrotask(() => {
        child.stdout.emit('data', 'TOKEN=super-segredo\n');
        child.emit('close', 0);
      });
      return child as never;
    }) as never,
  });
  const project = { ...makeProject(), path: directory };
  const output: string[] = [];
  const result = await adapter.run(
    project,
    {
      id: 'check',
      script: 'prod:check',
      phase: 'preparing',
      mutating: false,
      irreversible: false,
    },
    new AbortController().signal,
    (chunk) => output.push(chunk.content),
  );

  assert.equal(result.exitCode, 0);
  assert.deepEqual(invocation, {
    file: 'npm',
    args: ['run', 'prod:check'],
    cwd: directory,
    shell: false,
  });
  assert.doesNotMatch(output.join(''), /super-segredo/);
  assert.match(output.join(''), /CONTEUDO_MASCARADO/);
});

test('command adapter rejeita script divergente e packageManager desconhecido', async (t) => {
  const directory = await temporaryDirectory(t);
  await writeFile(
    path.join(directory, 'package.json'),
    JSON.stringify({ packageManager: 'deno@2.0.0' }),
  );
  const adapter = new ProductionCommandAdapter();
  const project = { ...makeProject(), path: directory };

  await assert.rejects(
    adapter.run(
      project,
      {
        id: 'check',
        script: 'postinstall',
        phase: 'preparing',
        mutating: false,
        irreversible: false,
      },
      new AbortController().signal,
      () => undefined,
    ),
    /script canônico/i,
  );

  await assert.rejects(
    adapter.run(
      project,
      {
        id: 'check',
        script: 'prod:check',
        phase: 'preparing',
        mutating: false,
        irreversible: false,
      },
      new AbortController().signal,
      () => undefined,
    ),
    (error: unknown) =>
      error instanceof DeploymentError &&
      error.code === 'DEPLOYMENT_PACKAGE_MANAGER_UNSUPPORTED',
  );
});

test('Git revision resolver usa git sem shell e falha fechado fora de repositório', async (t) => {
  const directory = await temporaryDirectory(t);
  execFileSync('git', ['init', '-b', 'main'], { cwd: directory });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], {
    cwd: directory,
  });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: directory });
  await writeFile(path.join(directory, 'README.md'), 'ok\n');
  execFileSync('git', ['add', 'README.md'], { cwd: directory });
  execFileSync('git', ['commit', '-m', 'init'], { cwd: directory });

  const resolver = new GitDeploymentRevisionResolver();
  const resolved = await resolver.resolve({
    ...makeProject(),
    path: directory,
  });
  assert.equal(resolved.branch, 'main');
  assert.match(resolved.revision, /^[0-9a-f]{40}$/);

  const outside = await temporaryDirectory(t);
  await assert.rejects(
    resolver.resolve({ ...makeProject(), path: outside }),
    (error: unknown) =>
      error instanceof DeploymentError &&
      error.code === 'DEPLOYMENT_REVISION_UNAVAILABLE',
  );
});
