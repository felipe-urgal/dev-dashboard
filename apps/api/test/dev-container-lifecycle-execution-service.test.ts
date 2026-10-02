import assert from 'node:assert/strict';
import test from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

import {
  DevContainerLifecycleExecutionError,
  DevContainerLifecycleExecutionService,
} from '../src/services/dev-container-lifecycle-execution-service.js';

const project: Project = {
  id: 'project-1',
  name: 'Projeto',
  path: '/workspace/project',
  type: 'node',
  source: 'workspace',
  enabled: true,
  capabilities: [],
};

const environmentInstance = {
  id: 'environment:primary:project-1',
  projectId: project.id,
  source: { kind: 'primary' as const, path: project.path },
  runtime: { kind: 'host' as const },
  lifecycle: 'ready' as const,
};

async function nextTurn(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

test('create vira job observável e registra activity sem bloquear a rota', async () => {
  const activities: string[] = [];
  const stages: string[] = [];
  const service = new DevContainerLifecycleExecutionService(
    {
      findForProject: () => environmentInstance,
    },
    {
      start: async (_project, input) => {
        input.onStage?.('creating-runtime');
        stages.push('start');
        return {
          environmentInstanceId: environmentInstance.id,
          runtime: 'devcontainer' as const,
          containerId: 'a'.repeat(64),
        };
      },
      rebuild: async () => {
        throw new Error('não usado');
      },
    },
    {
      inspect: async () => ({
        state: 'unowned' as const,
        environmentInstanceId: environmentInstance.id,
      }),
      cleanup: async () => {
        throw new Error('não usado');
      },
    },
    {
      consume: () => {
        throw new Error('não usado');
      },
    },
    {
      append: async (event) => {
        activities.push(`${event.type}:${event.status}`);
        return undefined;
      },
    },
    () => new Date('2026-10-02T10:00:00.000Z'),
  );

  const queued = service.start(
    project,
    'create',
    'a'.repeat(64),
    environmentInstance.id,
  );
  assert.equal(queued.status, 'queued');
  assert.equal(service.activityJobs(project.id).length, 1);

  await nextTurn();

  const finished = service.latest(project.id, environmentInstance.id);
  assert.equal(finished?.status, 'succeeded');
  assert.equal(finished?.stage, 'completed');
  assert.deepEqual(stages, ['start']);
  assert.deepEqual(activities, [
    'devcontainer.create:started',
    'devcontainer.create:succeeded',
  ]);
  assert.equal(service.activityJobs(project.id).length, 0);
});

test('cancelamento aborta create e preserva estado cancelled', async () => {
  let observedSignal: AbortSignal | undefined;
  const service = new DevContainerLifecycleExecutionService(
    { findForProject: () => environmentInstance },
    {
      start: async (_project, input) => {
        observedSignal = input.signal;
        await new Promise<void>((resolve, reject) => {
          if (input.signal?.aborted) {
            reject(new Error('cancelled'));
            return;
          }
          input.signal?.addEventListener(
            'abort',
            () => reject(new Error('cancelled')),
            { once: true },
          );
        });
        throw new Error('unreachable');
      },
      rebuild: async () => {
        throw new Error('não usado');
      },
    },
    {
      inspect: async () => ({
        state: 'unowned' as const,
        environmentInstanceId: environmentInstance.id,
      }),
      cleanup: async () => {
        throw new Error('não usado');
      },
    },
    { consume: () => 'ownership-token' },
  );

  service.start(project, 'create', 'a'.repeat(64), environmentInstance.id);
  await nextTurn();
  assert.equal(observedSignal?.aborted, false);

  service.cancel(project.id, environmentInstance.id);
  await nextTurn();

  assert.equal(observedSignal?.aborted, true);
  assert.equal(
    service.latest(project.id, environmentInstance.id)?.status,
    'cancelled',
  );
});

test('recovery reutiliza confirmação de stop e cleanup owned', async () => {
  const calls: string[] = [];
  const service = new DevContainerLifecycleExecutionService(
    { findForProject: () => environmentInstance },
    {
      start: async () => {
        throw new Error('não usado');
      },
      rebuild: async () => {
        throw new Error('não usado');
      },
    },
    {
      inspect: async (_project, environmentInstanceId) => {
        calls.push(`inspect:${environmentInstanceId}`);
        return {
          state: 'absent' as const,
          environmentInstanceId: environmentInstance.id,
          ownership: {
            projectId: project.id,
            environmentInstanceId: environmentInstance.id,
            projectPath: project.path,
            configSource: '.devcontainer/devcontainer.json' as const,
            ownershipToken: 'token',
            phase: 'starting' as const,
            claimedAt: '2026-10-02T10:00:00.000Z',
            updatedAt: '2026-10-02T10:00:00.000Z',
          },
        };
      },
      cleanup: async (_project, environmentInstanceId, ownershipToken) => {
        calls.push(`cleanup:${environmentInstanceId}:${ownershipToken}`);
        return {
          state: 'already-absent' as const,
          environmentInstanceId: environmentInstance.id,
        };
      },
    },
    {
      consume: (_project, _inspection, token) => {
        calls.push(`consume:${token}`);
        return 'ownership-token';
      },
    },
  );

  const queued = service.start(
    project,
    'recover',
    'b'.repeat(64),
    environmentInstance.id,
  );
  assert.equal(queued.cancelSupported, false);

  await nextTurn();

  assert.equal(
    service.latest(project.id, environmentInstance.id)?.status,
    'succeeded',
  );
  assert.deepEqual(calls, [
    `inspect:${environmentInstance.id}`,
    `consume:${'b'.repeat(64)}`,
    `cleanup:${environmentInstance.id}:ownership-token`,
  ]);
  assert.throws(
    () => service.cancel(project.id, environmentInstance.id),
    (error: unknown) =>
      error instanceof DevContainerLifecycleExecutionError &&
      error.code === 'DEV_CONTAINER_EXECUTION_NOT_FOUND',
  );
});

test('não permite dois lifecycle jobs ativos para a mesma Environment Instance', () => {
  const service = new DevContainerLifecycleExecutionService(
    { findForProject: () => environmentInstance },
    {
      start: async () =>
        new Promise(() => {
          // Mantém job ativo para testar exclusão mútua.
        }),
      rebuild: async () => {
        throw new Error('não usado');
      },
    },
    {
      inspect: async () => ({
        state: 'unowned' as const,
        environmentInstanceId: environmentInstance.id,
      }),
      cleanup: async () => {
        throw new Error('não usado');
      },
    },
    { consume: () => 'ownership-token' },
  );

  service.start(project, 'create', 'a'.repeat(64), environmentInstance.id);
  assert.throws(
    () =>
      service.start(project, 'create', 'c'.repeat(64), environmentInstance.id),
    (error: unknown) =>
      error instanceof DevContainerLifecycleExecutionError &&
      error.code === 'DEV_CONTAINER_EXECUTION_ALREADY_RUNNING',
  );
});
