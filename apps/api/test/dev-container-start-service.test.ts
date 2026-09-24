import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  DevelopmentEnvironmentInstance,
  Project,
} from '@dev-dashboard/contracts';

import type { DevContainerConfigSnapshot } from '../src/services/dev-container-config-snapshot-service.js';
import type { DevContainerLifecyclePreflight } from '../src/services/dev-container-lifecycle-planning-service.js';
import type { DevContainerOwnershipRecord } from '../src/services/dev-container-ownership-store.js';
import {
  DevContainerStartError,
  DevContainerStartService,
  type DevContainerStartCommandRunner,
} from '../src/services/dev-container-start-service.js';
import { DEV_CONTAINER_OWNERSHIP_LABEL } from '../src/services/dev-container-up-adapter.js';

const TOKEN = '11111111-1111-4111-8111-111111111111';
const CONFIRMATION = 'a'.repeat(64);
const CONFIG_HASH = 'b'.repeat(64);
const CONTAINER_ID = 'c'.repeat(64);

const project: Project = {
  id: 'project-1',
  name: 'Projeto',
  path: '/workspace/project',
  type: 'node',
  source: 'workspace',
  workspaceId: 'workspace-1',
  enabled: true,
  capabilities: [],
};

function instance(
  overrides: Partial<DevelopmentEnvironmentInstance> = {},
): DevelopmentEnvironmentInstance {
  return {
    id: 'environment:primary:project-1',
    projectId: project.id,
    source: {
      kind: 'primary',
      path: project.path,
    },
    runtime: { kind: 'host' },
    lifecycle: 'ready',
    ...overrides,
  };
}

function preflight(
  overrides: Partial<DevContainerLifecyclePreflight> = {},
): DevContainerLifecyclePreflight {
  return {
    projectId: project.id,
    operation: 'create',
    state: 'review',
    reason: 'review-required',
    observedAt: '2026-09-24T22:50:00.000Z',
    environmentInstanceId: 'environment:primary:project-1',
    runtime: 'host',
    executionEnabled: false,
    requiresConfirmation: true,
    discoveryState: 'available',
    configSource: '.devcontainer/devcontainer.json',
    configurationHash: CONFIG_HASH,
    cliVersion: '0.82.0',
    configuration: {
      kind: 'image',
      lifecycleHooks: [],
    },
    limitations: [],
    diagnostic: 'Revisão necessária.',
    ...overrides,
  };
}

function ownership(
  overrides: Partial<DevContainerOwnershipRecord> = {},
): DevContainerOwnershipRecord {
  return {
    projectId: project.id,
    environmentInstanceId: 'environment:primary:project-1',
    projectPath: project.path,
    configSource: '.devcontainer/devcontainer.json',
    ownershipToken: TOKEN,
    phase: 'starting',
    claimedAt: '2026-09-24T22:50:00.000Z',
    updatedAt: '2026-09-24T22:50:00.000Z',
    ...overrides,
  };
}

function snapshot(onDispose: () => void): DevContainerConfigSnapshot {
  return {
    originalConfigPath: '/workspace/project/.devcontainer/devcontainer.json',
    overrideConfigPath:
      '/state/dev-container-snapshots/snapshot/devcontainer.json',
    configurationHash: CONFIG_HASH,
    dispose: async () => {
      onDispose();
    },
  };
}

function fixture(
  options: {
    currentInstance?: DevelopmentEnvironmentInstance;
    plan?: DevContainerLifecyclePreflight;
    commandRunner?: DevContainerStartCommandRunner;
    snapshotCreateError?: Error;
    reserveError?: Error;
    attachError?: Error;
    cleanupError?: Error;
  } = {},
) {
  const current = options.currentInstance ?? instance();
  const upserts: DevelopmentEnvironmentInstance[] = [];
  const events: string[] = [];
  let disposed = 0;
  let cleanupCalls = 0;

  const service = new DevContainerStartService(
    {
      plan: async () => {
        events.push('plan');
        return options.plan ?? preflight();
      },
    },
    {
      consume: (_plan, token) => {
        events.push('confirm');
        if (token !== CONFIRMATION) {
          throw new Error('confirmation required');
        }
      },
    },
    {
      create: async () => {
        events.push('snapshot');
        if (options.snapshotCreateError) throw options.snapshotCreateError;
        return snapshot(() => {
          disposed += 1;
          events.push('dispose');
        });
      },
    },
    {
      reserve: async () => {
        events.push('reserve');
        if (options.reserveError) throw options.reserveError;
        return ownership();
      },
      attach: async ({ containerId }) => {
        events.push('attach');
        if (options.attachError) throw options.attachError;
        return ownership({
          phase: 'owned',
          containerId,
          updatedAt: '2026-09-24T22:51:00.000Z',
        });
      },
    },
    {
      cleanup: async () => {
        events.push('cleanup');
        cleanupCalls += 1;
        if (options.cleanupError) throw options.cleanupError;
        return {
          state: 'cleaned' as const,
          environmentInstanceId: current.id,
          containerId: CONTAINER_ID,
        };
      },
    },
    {
      findById: (id) => (id === current.id ? current : null),
      findPrimaryByProjectId: (projectId) =>
        projectId === current.projectId ? current : null,
      upsert: (value) => {
        events.push('upsert:' + value.lifecycle);
        upserts.push(value);
      },
    },
    options.commandRunner ??
      (async (command) => {
        events.push('command');
        assert.equal(command.program, 'devcontainer');
        assert.equal(
          command.args.includes(DEV_CONTAINER_OWNERSHIP_LABEL + '=' + TOKEN),
          true,
        );
        assert.equal(
          command.args.includes(
            '/state/dev-container-snapshots/snapshot/devcontainer.json',
          ),
          true,
        );
        return JSON.stringify({
          outcome: 'success',
          containerId: CONTAINER_ID,
        });
      }),
  );

  return {
    service,
    events,
    upserts,
    disposed: () => disposed,
    cleanupCalls: () => cleanupCalls,
  };
}

test('start cria runtime somente após confirmação, ownership e snapshot descartado', async () => {
  const f = fixture();
  const result = await f.service.start(project, {
    confirmationToken: CONFIRMATION,
  });

  assert.deepEqual(result, {
    environmentInstanceId: 'environment:primary:project-1',
    runtime: 'devcontainer',
    containerId: CONTAINER_ID,
  });
  assert.deepEqual(f.events, [
    'plan',
    'confirm',
    'snapshot',
    'reserve',
    'upsert:starting',
    'command',
    'attach',
    'dispose',
    'upsert:ready',
  ]);
  assert.equal(f.disposed(), 1);
  assert.equal(f.cleanupCalls(), 0);
  assert.deepEqual(f.upserts.at(-1), {
    ...instance(),
    runtime: {
      kind: 'devcontainer',
      runtimeId: CONTAINER_ID,
    },
    lifecycle: 'ready',
  });
});

test('start exige confirmação antes de snapshot ou ownership', async () => {
  const f = fixture();

  await assert.rejects(
    () => f.service.start(project),
    (error: unknown) =>
      error instanceof DevContainerStartError &&
      error.code === 'DEV_CONTAINER_START_CONFIRMATION_REQUIRED',
  );

  assert.deepEqual(f.events, ['plan', 'confirm']);
  assert.equal(f.cleanupCalls(), 0);
  assert.equal(f.disposed(), 0);
});

test('start falha antes de ownership quando snapshot não corresponde à confirmação', async () => {
  const f = fixture({
    snapshotCreateError: new Error('hash changed secret'),
  });

  await assert.rejects(
    () =>
      f.service.start(project, {
        confirmationToken: CONFIRMATION,
      }),
    (error: unknown) =>
      error instanceof DevContainerStartError &&
      error.code === 'DEV_CONTAINER_START_CONFIG_CHANGED' &&
      !error.message.includes('secret'),
  );

  assert.deepEqual(f.events, ['plan', 'confirm', 'snapshot']);
  assert.equal(f.cleanupCalls(), 0);
});

test('start exige Environment Instance host/ready antes de consumir confirmação', async () => {
  const f = fixture({
    currentInstance: instance({ lifecycle: 'failed' }),
  });

  await assert.rejects(
    () =>
      f.service.start(project, {
        confirmationToken: CONFIRMATION,
      }),
    (error: unknown) =>
      error instanceof DevContainerStartError &&
      error.code === 'DEV_CONTAINER_START_ENVIRONMENT_NOT_READY',
  );

  assert.deepEqual(f.events, ['plan']);
});

test('falha da CLI executa rollback owned e remove snapshot', async () => {
  const f = fixture({
    commandRunner: async () => {
      f.events.push('command');
      throw new Error('raw cli error with secret');
    },
  });

  await assert.rejects(
    () =>
      f.service.start(project, {
        confirmationToken: CONFIRMATION,
      }),
    (error: unknown) =>
      error instanceof DevContainerStartError &&
      error.code === 'DEV_CONTAINER_START_COMMAND_FAILED' &&
      !error.message.includes('secret'),
  );

  assert.equal(f.cleanupCalls(), 1);
  assert.equal(f.disposed() >= 1, true);
  assert.equal(f.events.includes('attach'), false);
});

test('envelope error ou compose inesperado fazem rollback', async () => {
  for (const output of [
    JSON.stringify({ outcome: 'error', containerId: CONTAINER_ID }),
    JSON.stringify({
      outcome: 'success',
      containerId: CONTAINER_ID,
      composeProjectName: 'unexpected',
    }),
  ]) {
    const f = fixture({
      commandRunner: async () => {
        f.events.push('command');
        return output;
      },
    });

    await assert.rejects(
      () =>
        f.service.start(project, {
          confirmationToken: CONFIRMATION,
        }),
      (error: unknown) =>
        error instanceof DevContainerStartError &&
        (error.code === 'DEV_CONTAINER_START_COMMAND_FAILED' ||
          error.code === 'DEV_CONTAINER_START_CONFIG_CHANGED'),
    );
    assert.equal(f.cleanupCalls(), 1);
  }
});

test('falha ao anexar ownership faz rollback por label da reserva starting', async () => {
  const f = fixture({
    attachError: new Error('state write failed'),
  });

  await assert.rejects(
    () =>
      f.service.start(project, {
        confirmationToken: CONFIRMATION,
      }),
    (error: unknown) =>
      error instanceof DevContainerStartError &&
      error.code === 'DEV_CONTAINER_START_OWNERSHIP_FAILED',
  );

  assert.equal(f.cleanupCalls(), 1);
  assert.equal(f.events.includes('attach'), true);
  assert.equal(f.events.includes('upsert:ready'), false);
});

test('falha do rollback substitui erro primário por estado fail-closed explícito', async () => {
  const f = fixture({
    commandRunner: async () => {
      throw new Error('cli failure');
    },
    cleanupError: new Error('docker cleanup failure'),
  });

  await assert.rejects(
    () =>
      f.service.start(project, {
        confirmationToken: CONFIRMATION,
      }),
    (error: unknown) =>
      error instanceof DevContainerStartError &&
      error.code === 'DEV_CONTAINER_START_ROLLBACK_FAILED' &&
      !error.message.includes('docker cleanup failure'),
  );
  assert.equal(f.cleanupCalls(), 1);
});

test('falha de reserva não inicia lifecycle nem chama cleanup', async () => {
  const f = fixture({
    reserveError: new Error('duplicate ownership'),
  });

  await assert.rejects(
    () =>
      f.service.start(project, {
        confirmationToken: CONFIRMATION,
      }),
    (error: unknown) =>
      error instanceof DevContainerStartError &&
      error.code === 'DEV_CONTAINER_START_OWNERSHIP_FAILED',
  );

  assert.equal(f.cleanupCalls(), 0);
  assert.equal(f.disposed(), 1);
  assert.equal(f.events.includes('upsert:starting'), false);
});
