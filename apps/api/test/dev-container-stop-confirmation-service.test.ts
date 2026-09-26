import assert from 'node:assert/strict';
import test from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

import {
  DevContainerStopConfirmationError,
  DevContainerStopConfirmationService,
} from '../src/services/dev-container-stop-confirmation-service.js';
import type { DevContainerCleanupInspection } from '../src/services/dev-container-cleanup-service.js';

const project: Project = {
  id: 'project-1',
  workspaceId: 'workspace-1',
  name: 'Project',
  path: '/workspace/project',
  type: 'node',
  source: 'workspace',
  enabled: true,
  capabilities: [],
};

const ownership = {
  projectId: project.id,
  environmentInstanceId: 'environment:primary:project-1',
  projectPath: project.path,
  configSource: '.devcontainer.json' as const,
  ownershipToken: '11111111-1111-4111-8111-111111111111',
  phase: 'owned' as const,
  containerId: 'a'.repeat(64),
  claimedAt: '2026-09-26T15:00:00.000Z',
  updatedAt: '2026-09-26T15:00:00.000Z',
};

function inspection(
  overrides: Partial<Extract<DevContainerCleanupInspection, { state: 'present' }>> = {},
): Extract<DevContainerCleanupInspection, { state: 'present' }> {
  return {
    state: 'present',
    environmentInstanceId: ownership.environmentInstanceId,
    ownership,
    containerId: ownership.containerId,
    running: true,
    ...overrides,
  };
}

test('stop confirmation é single-use e devolve ownership confirmado', () => {
  const service = new DevContainerStopConfirmationService({
    now: () => Date.parse('2026-09-26T15:00:00.000Z'),
    createToken: () => 'a'.repeat(64),
  });

  const confirmation = service.prepare(project, inspection());
  assert.equal(confirmation.environmentInstanceId, ownership.environmentInstanceId);
  assert.equal(
    service.consume(project, inspection(), confirmation.token),
    ownership.ownershipToken,
  );

  assert.throws(
    () => service.consume(project, inspection(), confirmation.token),
    (error: unknown) =>
      error instanceof DevContainerStopConfirmationError &&
      error.code === 'DEV_CONTAINER_STOP_CONFIRMATION_REQUIRED',
  );
});

test('stop confirmation falha fechado quando ownership muda', () => {
  const service = new DevContainerStopConfirmationService({
    createToken: () => 'b'.repeat(64),
  });
  const confirmation = service.prepare(project, inspection());
  const changed = inspection({
    ownership: {
      ...ownership,
      ownershipToken: '22222222-2222-4222-8222-222222222222',
    },
  });

  assert.throws(
    () => service.consume(project, changed, confirmation.token),
    (error: unknown) =>
      error instanceof DevContainerStopConfirmationError &&
      error.code === 'DEV_CONTAINER_STOP_CONFIRMATION_REQUIRED',
  );
});

test('runtime sem ownership não pode gerar confirmação de stop', () => {
  const service = new DevContainerStopConfirmationService();

  assert.throws(
    () =>
      service.prepare(project, {
        state: 'unowned',
        environmentInstanceId: ownership.environmentInstanceId,
      }),
    (error: unknown) =>
      error instanceof DevContainerStopConfirmationError &&
      error.code === 'DEV_CONTAINER_STOP_NOT_CONFIRMABLE',
  );
});
