import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DevContainerLifecycleConfirmationError,
  DevContainerLifecycleConfirmationService,
} from '../src/services/dev-container-lifecycle-confirmation-service.js';
import type { DevContainerLifecyclePreflight } from '../src/services/dev-container-lifecycle-planning-service.js';

const TOKEN = 'a'.repeat(64);

function review(
  overrides: Partial<DevContainerLifecyclePreflight> = {},
): DevContainerLifecyclePreflight {
  return {
    projectId: 'project-1',
    operation: 'create',
    state: 'review',
    reason: 'review-required',
    observedAt: '2026-09-24T22:20:00.000Z',
    environmentInstanceId: 'environment:primary:project-1',
    runtime: 'host',
    executionEnabled: false,
    requiresConfirmation: true,
    discoveryState: 'available',
    configSource: '.devcontainer/devcontainer.json',
    cliVersion: '0.82.0',
    configuration: {
      kind: 'image',
      name: 'Workspace',
      lifecycleHooks: ['postCreateCommand'],
    },
    limitations: ['cleanup-adapter-pending', 'post-create-hooks-deferred'],
    diagnostic: 'Revisão humana necessária.',
    ...overrides,
  };
}

test('confirmação Dev Container é curta, single-use e vinculada ao preflight', () => {
  let now = Date.parse('2026-09-24T22:20:00.000Z');
  const service = new DevContainerLifecycleConfirmationService({
    ttlMs: 60_000,
    now: () => now,
    createToken: () => TOKEN,
  });

  const plan = review();
  const confirmation = service.prepare(plan);

  assert.equal(confirmation.token, TOKEN);
  assert.equal(confirmation.projectId, plan.projectId);
  assert.equal(confirmation.environmentInstanceId, plan.environmentInstanceId);
  assert.equal(confirmation.operation, 'create');
  assert.match(confirmation.preflightHash, /^[a-f0-9]{64}$/u);
  assert.equal(confirmation.expiresAt, '2026-09-24T22:21:00.000Z');

  now += 1_000;
  service.consume(plan, TOKEN);
  assert.throws(
    () => service.consume(plan, TOKEN),
    (error: unknown) =>
      error instanceof DevContainerLifecycleConfirmationError &&
      error.code === 'DEV_CONTAINER_CONFIRMATION_REQUIRED',
  );
});

test('mudança de configuração ou Environment Instance invalida confirmação', () => {
  const service = new DevContainerLifecycleConfirmationService({
    createToken: () => TOKEN,
  });
  const plan = review();
  service.prepare(plan);

  assert.throws(
    () =>
      service.consume(
        review({
          environmentInstanceId: 'environment:worktree:project-1:feature',
        }),
        TOKEN,
      ),
    (error: unknown) =>
      error instanceof DevContainerLifecycleConfirmationError &&
      error.code === 'DEV_CONTAINER_CONFIRMATION_REQUIRED',
  );

  service.prepare(plan);
  assert.throws(
    () =>
      service.consume(
        review({
          configuration: {
            kind: 'dockerfile',
            lifecycleHooks: ['postCreateCommand'],
          },
        }),
        TOKEN,
      ),
    (error: unknown) =>
      error instanceof DevContainerLifecycleConfirmationError &&
      error.code === 'DEV_CONTAINER_CONFIRMATION_REQUIRED',
  );
});

test('mudança de hooks invalida confirmação, mas timestamp/diagnóstico não', () => {
  const service = new DevContainerLifecycleConfirmationService({
    createToken: () => TOKEN,
  });
  const plan = review();
  service.prepare(plan);

  assert.throws(
    () =>
      service.consume(
        review({
          configuration: {
            kind: 'image',
            name: 'Workspace',
            lifecycleHooks: ['postCreateCommand', 'postStartCommand'],
          },
        }),
        TOKEN,
      ),
    (error: unknown) =>
      error instanceof DevContainerLifecycleConfirmationError &&
      error.code === 'DEV_CONTAINER_CONFIRMATION_REQUIRED',
  );

  service.prepare(plan);
  service.consume(
    review({
      observedAt: '2026-09-24T22:20:30.000Z',
      diagnostic: 'Mesmo plano revalidado em outro instante.',
    }),
    TOKEN,
  );
});

test('preflight bloqueado ou indisponível não pode ser confirmado', () => {
  const service = new DevContainerLifecycleConfirmationService({
    createToken: () => TOKEN,
  });

  for (const plan of [
    review({
      state: 'blocked',
      reason: 'initialize-command-declared',
      requiresConfirmation: false,
    }),
    review({
      state: 'unavailable',
      reason: 'discovery-not-ready',
      requiresConfirmation: false,
      configuration: undefined,
      configSource: undefined,
    }),
  ]) {
    assert.throws(
      () => service.prepare(plan),
      (error: unknown) =>
        error instanceof DevContainerLifecycleConfirmationError &&
        error.code === 'DEV_CONTAINER_PLAN_NOT_CONFIRMABLE',
    );
  }
});

test('confirmação expirada não pode ser consumida', () => {
  let now = 1_000;
  const service = new DevContainerLifecycleConfirmationService({
    ttlMs: 50,
    now: () => now,
    createToken: () => TOKEN,
  });
  const plan = review();
  service.prepare(plan);

  now = 1_051;
  assert.throws(
    () => service.consume(plan, TOKEN),
    (error: unknown) =>
      error instanceof DevContainerLifecycleConfirmationError &&
      error.code === 'DEV_CONTAINER_CONFIRMATION_REQUIRED',
  );
});
