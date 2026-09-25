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
  DevContainerRebuildError,
  DevContainerStartService,
} from '../src/services/dev-container-start-service.js';
import { DEV_CONTAINER_OWNERSHIP_LABEL } from '../src/services/dev-container-up-adapter.js';

const OLD_CONTAINER_ID = 'a'.repeat(64);
const NEW_CONTAINER_ID = 'b'.repeat(64);
const OLD_OWNERSHIP_TOKEN = '11111111-1111-4111-8111-111111111111';
const NEW_OWNERSHIP_TOKEN = '22222222-2222-4222-8222-222222222222';
const CONFIRMATION = 'c'.repeat(64);
const CONFIG_HASH = 'd'.repeat(64);

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

function devContainerInstance(): DevelopmentEnvironmentInstance {
  return {
    id: 'environment:primary:project-1',
    projectId: project.id,
    source: {
      kind: 'primary',
      path: project.path,
    },
    runtime: {
      kind: 'devcontainer',
      runtimeId: OLD_CONTAINER_ID,
    },
    lifecycle: 'ready',
  };
}

function rebuildPreflight(
  overrides: Partial<DevContainerLifecyclePreflight> = {},
): DevContainerLifecyclePreflight {
  return {
    projectId: project.id,
    operation: 'rebuild',
    state: 'review',
    reason: 'review-required',
    observedAt: '2026-09-25T11:20:00.000Z',
    environmentInstanceId: 'environment:primary:project-1',
    runtime: 'devcontainer',
    runtimeId: OLD_CONTAINER_ID,
    ownershipToken: OLD_OWNERSHIP_TOKEN,
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
    diagnostic: 'Rebuild exige revisão.',
    ...overrides,
  };
}

function ownedRuntime(
  overrides: Partial<DevContainerOwnershipRecord> = {},
): DevContainerOwnershipRecord {
  return {
    projectId: project.id,
    environmentInstanceId: 'environment:primary:project-1',
    projectPath: project.path,
    configSource: '.devcontainer/devcontainer.json',
    ownershipToken: OLD_OWNERSHIP_TOKEN,
    phase: 'owned',
    containerId: OLD_CONTAINER_ID,
    claimedAt: '2026-09-25T11:10:00.000Z',
    updatedAt: '2026-09-25T11:15:00.000Z',
    ...overrides,
  };
}

function snapshot(onDispose: () => void): DevContainerConfigSnapshot {
  return {
    originalConfigPath: '/workspace/project/.devcontainer/devcontainer.json',
    overrideConfigPath:
      '/state/dev-container-snapshots/rebuild/devcontainer.json',
    configurationHash: CONFIG_HASH,
    dispose: async () => onDispose(),
  };
}

function fixture(options: {
  plan?: DevContainerLifecyclePreflight;
  ownership?: DevContainerOwnershipRecord | undefined;
  snapshotError?: Error;
  cleanupErrorAt?: number;
  commandError?: Error;
} = {}) {
  let current = devContainerInstance();
  let disposed = 0;
  let cleanupCalls = 0;
  const events: string[] = [];

  const service = new DevContainerStartService(
    {
      plan: async () => {
        events.push('plan');
        return options.plan ?? rebuildPreflight();
      },
    },
    {
      consume: (_plan, token) => {
        events.push('confirm');
        if (token !== CONFIRMATION) throw new Error('confirmation required');
      },
    },
    {
      create: async () => {
        events.push('snapshot');
        if (options.snapshotError) throw options.snapshotError;
        return snapshot(() => {
          disposed += 1;
          events.push('dispose');
        });
      },
    },
    {
      get: async () => {
        events.push('ownership:get');
        return options.ownership === undefined
          ? ownedRuntime()
          : options.ownership;
      },
      reserve: async () => {
        events.push('reserve');
        return {
          projectId: project.id,
          environmentInstanceId: 'environment:primary:project-1',
          projectPath: project.path,
          configSource: '.devcontainer/devcontainer.json',
          ownershipToken: NEW_OWNERSHIP_TOKEN,
          phase: 'starting',
          claimedAt: '2026-09-25T11:21:00.000Z',
          updatedAt: '2026-09-25T11:21:00.000Z',
        };
      },
      attach: async ({ containerId }) => {
        events.push('attach');
        return ownedRuntime({
          ownershipToken: NEW_OWNERSHIP_TOKEN,
          phase: 'owned',
          containerId,
          claimedAt: '2026-09-25T11:21:00.000Z',
          updatedAt: '2026-09-25T11:22:00.000Z',
        });
      },
    },
    {
      cleanup: async () => {
        cleanupCalls += 1;
        events.push('cleanup:' + cleanupCalls);
        if (options.cleanupErrorAt === cleanupCalls) {
          throw new Error('cleanup failed');
        }
        current = {
          ...current,
          runtime: { kind: 'host' },
          lifecycle: 'ready',
        };
        return {
          state: 'cleaned' as const,
          environmentInstanceId: current.id,
          containerId:
            cleanupCalls === 1 ? OLD_CONTAINER_ID : NEW_CONTAINER_ID,
        };
      },
    },
    {
      findById: (id) => (id === current.id ? current : null),
      findPrimaryByProjectId: (projectId) =>
        projectId === current.projectId ? current : null,
      upsert: (value) => {
        events.push('upsert:' + value.lifecycle);
        current = value;
      },
    },
    async (command) => {
      events.push('command');
      if (options.commandError) throw options.commandError;
      assert.equal(command.program, 'devcontainer');
      assert.equal(
        command.args.includes(
          DEV_CONTAINER_OWNERSHIP_LABEL + '=' + NEW_OWNERSHIP_TOKEN,
        ),
        true,
      );
      assert.equal(
        command.args.includes(
          '/state/dev-container-snapshots/rebuild/devcontainer.json',
        ),
        true,
      );
      return JSON.stringify({
        outcome: 'success',
        containerId: NEW_CONTAINER_ID,
      });
    },
  );

  return {
    service,
    events,
    current: () => current,
    disposed: () => disposed,
    cleanupCalls: () => cleanupCalls,
  };
}

test('rebuild confirma, congela config, limpa runtime antigo e recria com novo ownership', async () => {
  const f = fixture();

  const result = await f.service.rebuild(project, {
    confirmationToken: CONFIRMATION,
  });

  assert.deepEqual(result, {
    environmentInstanceId: 'environment:primary:project-1',
    runtime: 'devcontainer',
    containerId: NEW_CONTAINER_ID,
  });
  assert.deepEqual(f.events, [
    'plan',
    'confirm',
    'ownership:get',
    'snapshot',
    'cleanup:1',
    'reserve',
    'upsert:starting',
    'command',
    'attach',
    'dispose',
    'upsert:ready',
  ]);
  assert.equal(f.cleanupCalls(), 1);
  assert.equal(f.disposed(), 1);
  assert.deepEqual(f.current().runtime, {
    kind: 'devcontainer',
    runtimeId: NEW_CONTAINER_ID,
  });
  assert.equal(f.current().lifecycle, 'ready');
});

test('rebuild falha fechado se ownership mudar depois da confirmação', async () => {
  const f = fixture({
    ownership: ownedRuntime({
      ownershipToken: '33333333-3333-4333-8333-333333333333',
    }),
  });

  await assert.rejects(
    () =>
      f.service.rebuild(project, {
        confirmationToken: CONFIRMATION,
      }),
    (error: unknown) =>
      error instanceof DevContainerRebuildError &&
      error.code === 'DEV_CONTAINER_REBUILD_OWNERSHIP_CHANGED',
  );

  assert.deepEqual(f.events, ['plan', 'confirm', 'ownership:get']);
  assert.equal(f.cleanupCalls(), 0);
  assert.equal(f.disposed(), 0);
});

test('rebuild não limpa runtime atual se o snapshot confirmado não puder ser criado', async () => {
  const f = fixture({ snapshotError: new Error('changed secret') });

  await assert.rejects(
    () =>
      f.service.rebuild(project, {
        confirmationToken: CONFIRMATION,
      }),
    (error: unknown) =>
      error instanceof DevContainerRebuildError &&
      error.code === 'DEV_CONTAINER_REBUILD_CONFIG_CHANGED' &&
      !error.message.includes('secret'),
  );

  assert.equal(f.cleanupCalls(), 0);
  assert.deepEqual(f.events, [
    'plan',
    'confirm',
    'ownership:get',
    'snapshot',
  ]);
});

test('rebuild descarta snapshot e não recria se cleanup do runtime antigo falhar', async () => {
  const f = fixture({ cleanupErrorAt: 1 });

  await assert.rejects(
    () =>
      f.service.rebuild(project, {
        confirmationToken: CONFIRMATION,
      }),
    (error: unknown) =>
      error instanceof DevContainerRebuildError &&
      error.code === 'DEV_CONTAINER_REBUILD_CLEANUP_FAILED',
  );

  assert.equal(f.cleanupCalls(), 1);
  assert.equal(f.disposed(), 1);
  assert.equal(f.events.includes('reserve'), false);
  assert.equal(f.events.includes('command'), false);
});

test('rebuild faz rollback do novo ownership se recriação falhar', async () => {
  const f = fixture({ commandError: new Error('raw cli secret') });

  await assert.rejects(
    () =>
      f.service.rebuild(project, {
        confirmationToken: CONFIRMATION,
      }),
    (error: unknown) =>
      error instanceof DevContainerRebuildError &&
      error.code === 'DEV_CONTAINER_REBUILD_CREATE_FAILED' &&
      !error.message.includes('secret'),
  );

  assert.equal(f.cleanupCalls(), 2);
  assert.equal(f.disposed() >= 1, true);
  assert.deepEqual(f.current().runtime, { kind: 'host' });
  assert.equal(f.current().lifecycle, 'ready');
});

test('rebuild expõe rollback fail-closed quando cleanup do novo runtime também falha', async () => {
  const f = fixture({
    commandError: new Error('create failed'),
    cleanupErrorAt: 2,
  });

  await assert.rejects(
    () =>
      f.service.rebuild(project, {
        confirmationToken: CONFIRMATION,
      }),
    (error: unknown) =>
      error instanceof DevContainerRebuildError &&
      error.code === 'DEV_CONTAINER_REBUILD_ROLLBACK_FAILED',
  );

  assert.equal(f.cleanupCalls(), 2);
});
