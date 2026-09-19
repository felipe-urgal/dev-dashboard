import assert from 'node:assert/strict';
import test from 'node:test';

import type { MigrationMutationPlan } from '../src/services/migration-mutation-provider.js';
import {
  MigrationMutationConfirmationError,
  MigrationMutationConfirmationService,
} from '../src/services/migration-mutation-confirmation-service.js';

function readyPlan(
  overrides: Partial<MigrationMutationPlan> = {},
): MigrationMutationPlan {
  return {
    projectId: 'project-1',
    provider: 'rails',
    operation: 'apply',
    database: 'primary',
    environmentInstanceId: 'environment:primary:project-1',
    runtime: 'host',
    executionContextHash: 'c'.repeat(64),
    createdAt: '2026-09-19T18:20:00.000Z',
    overviewObservedAt: '2026-09-19T18:19:00.000Z',
    planHash: 'a'.repeat(64),
    preflight: {
      state: 'ready',
      reason: 'ready',
      observedAt: '2026-09-19T18:19:00.000Z',
      evidence: 'Rails db:migrate:status',
    },
    command: {
      file: 'bundle',
      args: ['exec', 'rails', 'db:migrate'],
    },
    ...overrides,
  };
}

test('confirmation é curta, vinculada ao plano e de uso único', () => {
  let now = Date.parse('2026-09-19T18:20:00.000Z');
  const service = new MigrationMutationConfirmationService(60_000, () => now);
  const plan = readyPlan();

  const confirmation = service.prepare(plan);

  assert.equal(confirmation.projectId, plan.projectId);
  assert.equal(confirmation.environmentInstanceId, plan.environmentInstanceId);
  assert.equal(confirmation.provider, plan.provider);
  assert.equal(confirmation.operation, plan.operation);
  assert.equal(confirmation.planHash, plan.planHash);
  assert.match(confirmation.token, /^[a-f0-9]{64}$/u);
  assert.equal(confirmation.expiresAt, '2026-09-19T18:21:00.000Z');

  service.consume(plan, confirmation.token);

  assert.throws(
    () => service.consume(plan, confirmation.token),
    (error: unknown) => {
      assert.ok(error instanceof MigrationMutationConfirmationError);
      assert.equal(error.code, 'MIGRATION_MUTATION_CONFIRMATION_REQUIRED');
      return true;
    },
  );

  now += 1;
});

test('token não pode ser reutilizado em outro hash, projeto ou Environment Instance', () => {
  const service = new MigrationMutationConfirmationService();
  const plan = readyPlan();
  const confirmation = service.prepare(plan);

  for (const changed of [
    readyPlan({ planHash: 'b'.repeat(64) }),
    readyPlan({ projectId: 'project-2' }),
    readyPlan({ environmentInstanceId: 'environment:worktree:project-1:wt-1' }),
  ]) {
    assert.throws(
      () => service.consume(changed, confirmation.token),
      (error: unknown) => {
        assert.ok(error instanceof MigrationMutationConfirmationError);
        assert.equal(error.code, 'MIGRATION_MUTATION_CONFIRMATION_REQUIRED');
        return true;
      },
    );
  }

  service.consume(plan, confirmation.token);
});

test('token expirado falha fechado', () => {
  let now = 1_000;
  const service = new MigrationMutationConfirmationService(100, () => now);
  const plan = readyPlan();
  const confirmation = service.prepare(plan);

  now = 1_101;

  assert.throws(
    () => service.consume(plan, confirmation.token),
    (error: unknown) => {
      assert.ok(error instanceof MigrationMutationConfirmationError);
      assert.equal(error.code, 'MIGRATION_MUTATION_CONFIRMATION_REQUIRED');
      return true;
    },
  );
});

test('plano bloqueado ou sem comando nunca recebe confirmação', () => {
  const service = new MigrationMutationConfirmationService();
  const noCommand = readyPlan();
  delete noCommand.command;

  for (const plan of [
    readyPlan({
      preflight: {
        state: 'blocked',
        reason: 'nothing-pending',
        observedAt: '2026-09-19T18:19:00.000Z',
        evidence: 'Rails db:migrate:status',
      },
    }),
    noCommand,
  ]) {
    assert.throws(
      () => service.prepare(plan),
      (error: unknown) => {
        assert.ok(error instanceof MigrationMutationConfirmationError);
        assert.equal(error.code, 'MIGRATION_MUTATION_PLAN_NOT_READY');
        return true;
      },
    );
  }
});
