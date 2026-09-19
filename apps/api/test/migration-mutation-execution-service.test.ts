import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import type { ExecutionContext, Project } from '@dev-dashboard/contracts';

import { DetachableExecutionService } from '../src/services/detachable-execution-service.js';
import {
  MigrationMutationConfirmationError,
  MigrationMutationConfirmationService,
} from '../src/services/migration-mutation-confirmation-service.js';
import {
  MigrationMutationExecutionError,
  MigrationMutationExecutionService,
  type MigrationMutationExecutionSnapshot,
} from '../src/services/migration-mutation-execution-service.js';
import type { MigrationMutationPlan } from '../src/services/migration-mutation-provider.js';

class FakePty extends EventEmitter {
  public readonly kills: string[] = [];
  private dataListener: ((data: string) => void) | undefined;
  private exitListener:
    ((event: { exitCode: number; signal?: number }) => void) | undefined;

  public onData(listener: (data: string) => void): { dispose(): void } {
    this.dataListener = listener;
    return { dispose: () => (this.dataListener = undefined) };
  }

  public onExit(
    listener: (event: { exitCode: number; signal?: number }) => void,
  ): { dispose(): void } {
    this.exitListener = listener;
    return { dispose: () => (this.exitListener = undefined) };
  }

  public write(): void {}
  public resize(): void {}

  public kill(signal?: string): void {
    this.kills.push(signal ?? 'default');
  }

  public emitData(data: string): void {
    this.dataListener?.(data);
  }

  public emitExit(exitCode: number, signal?: number): void {
    this.exitListener?.({ exitCode, signal });
  }
}

const project: Project = {
  id: 'project-1',
  name: 'Projeto',
  path: '/workspace/project-1',
  type: 'rails',
  source: 'workspace',
  enabled: true,
  capabilities: [],
};

const executionContext: ExecutionContext = {
  projectId: project.id,
  environmentInstanceId: 'environment:primary:project-1',
  cwd: '/workspace/project-1',
  runtime: 'host',
};

function readyPlan(
  overrides: Partial<MigrationMutationPlan> = {},
): MigrationMutationPlan {
  return {
    projectId: project.id,
    provider: 'rails',
    operation: 'apply',
    database: 'primary',
    environmentInstanceId: executionContext.environmentInstanceId,
    runtime: 'host',
    executionContextHash: 'c'.repeat(64),
    overviewHash: 'd'.repeat(64),
    createdAt: '2026-09-19T18:30:00.000Z',
    overviewObservedAt: '2026-09-19T18:29:00.000Z',
    planHash: 'a'.repeat(64),
    preflight: {
      state: 'ready',
      reason: 'ready',
      observedAt: '2026-09-19T18:29:00.000Z',
      evidence: 'Rails db:migrate:status',
    },
    command: {
      file: 'bundle',
      args: ['exec', 'rails', 'db:migrate'],
    },
    ...overrides,
  };
}

test('executor revalida, consome confirmação e inicia PTY no cwd backend-owned', async () => {
  const fakePty = new FakePty();
  let spawned:
    { file: string; args: readonly string[]; cwd: string } | undefined;
  const detachable = new DetachableExecutionService({
    spawnPty: (file, args, options) => {
      spawned = { file, args, cwd: options.cwd };
      return fakePty as never;
    },
  });
  const confirmations = new MigrationMutationConfirmationService();
  const plan = readyPlan();
  const confirmation = confirmations.prepare(plan);
  const service = new MigrationMutationExecutionService(
    {
      plan: async () => plan,
      resolveExecutionContext: () => executionContext,
    },
    confirmations,
    detachable,
  );

  const snapshot = await service.start(
    project,
    { operation: 'apply' },
    confirmation.token,
  );

  assert.deepEqual(spawned, {
    file: 'bundle',
    args: ['exec', 'rails', 'db:migrate'],
    cwd: executionContext.cwd,
  });
  assert.equal(snapshot.status, 'running');
  assert.equal(snapshot.provider, 'rails');
  assert.equal(snapshot.operation, 'apply');
  assert.equal(snapshot.database, 'primary');
  assert.equal(
    snapshot.environmentInstanceId,
    executionContext.environmentInstanceId,
  );
  assert.equal(snapshot.planHash, plan.planHash);

  assert.throws(
    () => confirmations.consume(plan, confirmation.token),
    (error: unknown) =>
      error instanceof MigrationMutationConfirmationError &&
      error.code === 'MIGRATION_MUTATION_CONFIRMATION_REQUIRED',
  );
});

test('executor preserva metadata no snapshot, attach e exit e suporta cancelamento', async () => {
  const fakePty = new FakePty();
  const detachable = new DetachableExecutionService({
    spawnPty: () => fakePty as never,
  });
  const confirmations = new MigrationMutationConfirmationService();
  const plan = readyPlan();
  const service = new MigrationMutationExecutionService(
    {
      plan: async () => plan,
      resolveExecutionContext: () => executionContext,
    },
    confirmations,
    detachable,
  );
  const confirmation = confirmations.prepare(plan);
  await service.start(project, { operation: 'apply' }, confirmation.token);

  const data: string[] = [];
  let exited: MigrationMutationExecutionSnapshot | undefined;
  const handle = service.attach(
    project.id,
    executionContext.environmentInstanceId,
    (chunk) => data.push(chunk),
    (snapshot) => {
      exited = snapshot;
    },
  );

  assert.equal(handle.snapshot.provider, 'rails');
  assert.equal(
    service.snapshot(project.id, executionContext.environmentInstanceId)
      ?.planHash,
    plan.planHash,
  );

  fakePty.emitData('migrating...\n');
  assert.deepEqual(data, ['migrating...\n']);

  fakePty.emitExit(0);
  assert.equal(exited?.status, 'exited');
  assert.equal(exited?.exitCode, 0);
  assert.equal(exited?.provider, 'rails');

  const late = service.attach(
    project.id,
    executionContext.environmentInstanceId,
    () => undefined,
    () => undefined,
  );
  assert.equal(late.snapshot.status, 'exited');
  assert.equal(late.snapshot.planHash, plan.planHash);

  const secondPty = new FakePty();
  const secondDetachable = new DetachableExecutionService({
    spawnPty: () => secondPty as never,
  });
  const secondConfirmations = new MigrationMutationConfirmationService();
  const secondService = new MigrationMutationExecutionService(
    {
      plan: async () => plan,
      resolveExecutionContext: () => executionContext,
    },
    secondConfirmations,
    secondDetachable,
  );
  const secondConfirmation = secondConfirmations.prepare(plan);
  await secondService.start(
    project,
    { operation: 'apply' },
    secondConfirmation.token,
  );
  secondService.cancel(project.id, executionContext.environmentInstanceId);
  assert.deepEqual(secondPty.kills, ['SIGTERM']);
});

test('mudança de Environment Instance invalida execução antes de consumir token', async () => {
  const detachable = new DetachableExecutionService({
    spawnPty: () => {
      throw new Error('não deve iniciar');
    },
  });
  const confirmations = new MigrationMutationConfirmationService();
  const plan = readyPlan();
  const confirmation = confirmations.prepare(plan);
  let contextAvailable = false;
  const service = new MigrationMutationExecutionService(
    {
      plan: async () => plan,
      resolveExecutionContext: () =>
        contextAvailable ? executionContext : null,
    },
    confirmations,
    detachable,
  );

  await assert.rejects(
    () => service.start(project, { operation: 'apply' }, confirmation.token),
    (error: unknown) =>
      error instanceof MigrationMutationExecutionError &&
      error.code === 'MIGRATION_MUTATION_EXECUTION_CONTEXT_CHANGED',
  );

  contextAvailable = true;
  assert.doesNotThrow(() => confirmations.consume(plan, confirmation.token));
});

test('confirmation de plano anterior não autoriza revalidação com novo hash', async () => {
  let spawned = false;
  const detachable = new DetachableExecutionService({
    spawnPty: () => {
      spawned = true;
      return new FakePty() as never;
    },
  });
  const confirmations = new MigrationMutationConfirmationService();
  const initial = readyPlan();
  const confirmation = confirmations.prepare(initial);
  const revalidated = readyPlan({ planHash: 'b'.repeat(64) });
  const service = new MigrationMutationExecutionService(
    {
      plan: async () => revalidated,
      resolveExecutionContext: () => executionContext,
    },
    confirmations,
    detachable,
  );

  await assert.rejects(
    () => service.start(project, { operation: 'apply' }, confirmation.token),
    (error: unknown) =>
      error instanceof MigrationMutationConfirmationError &&
      error.code === 'MIGRATION_MUTATION_CONFIRMATION_REQUIRED',
  );
  assert.equal(spawned, false);
});

test('segunda mutation concorrente no mesmo ambiente falha com código comum', async () => {
  const fakePty = new FakePty();
  const detachable = new DetachableExecutionService({
    spawnPty: () => fakePty as never,
  });
  const confirmations = new MigrationMutationConfirmationService();
  const plan = readyPlan();
  const service = new MigrationMutationExecutionService(
    {
      plan: async () => plan,
      resolveExecutionContext: () => executionContext,
    },
    confirmations,
    detachable,
  );

  const first = confirmations.prepare(plan);
  await service.start(project, { operation: 'apply' }, first.token);

  const second = confirmations.prepare(plan);
  await assert.rejects(
    () => service.start(project, { operation: 'apply' }, second.token),
    (error: unknown) =>
      error instanceof MigrationMutationExecutionError &&
      error.code === 'MIGRATION_MUTATION_ALREADY_RUNNING',
  );
});
