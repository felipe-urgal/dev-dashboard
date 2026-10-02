import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  DevelopmentEnvironmentInstance,
  Project,
} from '@dev-dashboard/contracts';

import { DevContainerRecoveryService } from '../src/services/dev-container-recovery-service.js';

const project: Project = {
  id: 'project-1',
  name: 'Projeto',
  path: '/workspace/project',
  type: 'node',
  source: 'workspace',
  enabled: true,
  capabilities: [],
};

function instance(
  overrides: Partial<DevelopmentEnvironmentInstance> = {},
): DevelopmentEnvironmentInstance {
  return {
    id: 'environment:primary:project-1',
    projectId: project.id,
    source: { kind: 'primary', path: project.path },
    runtime: { kind: 'host' },
    lifecycle: 'starting',
    ...overrides,
  };
}

function ownership(phase: 'starting' | 'owned' = 'starting') {
  return {
    projectId: project.id,
    environmentInstanceId: 'environment:primary:project-1',
    projectPath: project.path,
    configSource: '.devcontainer/devcontainer.json' as const,
    ownershipToken: '11111111-1111-4111-8111-111111111111',
    phase,
    ...(phase === 'owned' ? { containerId: 'a'.repeat(64) } : {}),
    claimedAt: '2026-10-02T10:00:00.000Z',
    updatedAt: '2026-10-02T10:00:00.000Z',
  };
}

test('normaliza reserva sem container após restart', async () => {
  const current = instance();
  const cleaned: string[] = [];
  const service = new DevContainerRecoveryService(
    { findProject: () => project },
    {
      list: () => [current],
      upsert: () => undefined,
    },
    {
      inspect: async () => ({
        state: 'absent' as const,
        environmentInstanceId: current.id,
        ownership: ownership(),
      }),
      cleanup: async (_project, environmentInstanceId) => {
        cleaned.push(environmentInstanceId ?? '');
        return {
          state: 'already-absent' as const,
          environmentInstanceId: current.id,
        };
      },
    },
  );

  const result = await service.reconcile();

  assert.deepEqual(result, {
    inspected: 1,
    normalized: 1,
    recoveryRequired: 0,
    failed: 0,
  });
  assert.deepEqual(cleaned, [current.id]);
});

test('runtime parcial presente vira failed/recovery-required sem cleanup automático', async () => {
  const current = instance();
  const updates: DevelopmentEnvironmentInstance[] = [];
  let cleanupCalled = false;
  const service = new DevContainerRecoveryService(
    { findProject: () => project },
    {
      list: () => [current],
      upsert: (value) => updates.push(value),
    },
    {
      inspect: async () => ({
        state: 'present' as const,
        environmentInstanceId: current.id,
        ownership: ownership(),
        containerId: 'b'.repeat(64),
        running: true,
      }),
      cleanup: async () => {
        cleanupCalled = true;
        return {
          state: 'cleaned' as const,
          environmentInstanceId: current.id,
          containerId: 'b'.repeat(64),
        };
      },
    },
  );

  const result = await service.reconcile();

  assert.equal(result.recoveryRequired, 1);
  assert.equal(cleanupCalled, false);
  assert.equal(updates.at(-1)?.lifecycle, 'failed');
});

test('runtime owned já persistido como devcontainer volta a ready após restart', async () => {
  const runtimeId = 'a'.repeat(64);
  const current = instance({
    runtime: { kind: 'devcontainer', runtimeId },
    lifecycle: 'starting',
  });
  const updates: DevelopmentEnvironmentInstance[] = [];
  const service = new DevContainerRecoveryService(
    { findProject: () => project },
    {
      list: () => [current],
      upsert: (value) => updates.push(value),
    },
    {
      inspect: async () => ({
        state: 'present' as const,
        environmentInstanceId: current.id,
        ownership: ownership('owned'),
        containerId: runtimeId,
        running: true,
      }),
      cleanup: async () => {
        throw new Error('não deve limpar runtime comprovadamente ativo');
      },
    },
  );

  const result = await service.reconcile();

  assert.equal(result.normalized, 1);
  assert.equal(updates.at(-1)?.lifecycle, 'ready');
  assert.equal(updates.at(-1)?.runtime.kind, 'devcontainer');
});

test('stop interrompido é retomado somente quando ownership permanece comprovado', async () => {
  const runtimeId = 'a'.repeat(64);
  const current = instance({
    runtime: { kind: 'devcontainer', runtimeId },
    lifecycle: 'stopping',
  });
  let cleaned = false;
  const service = new DevContainerRecoveryService(
    { findProject: () => project },
    {
      list: () => [current],
      upsert: () => undefined,
    },
    {
      inspect: async () => ({
        state: 'present' as const,
        environmentInstanceId: current.id,
        ownership: ownership('owned'),
        containerId: runtimeId,
        running: false,
      }),
      cleanup: async () => {
        cleaned = true;
        return {
          state: 'cleaned' as const,
          environmentInstanceId: current.id,
          containerId: runtimeId,
        };
      },
    },
  );

  const result = await service.reconcile();

  assert.equal(cleaned, true);
  assert.equal(result.normalized, 1);
});
