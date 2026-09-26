import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  DevelopmentEnvironmentInstance,
  Project,
} from '@dev-dashboard/contracts';

import {
  DevContainerCleanupError,
  DevContainerCleanupService,
  type DevContainerCleanupCommandRunner,
} from '../src/services/dev-container-cleanup-service.js';
import type { DevContainerOwnershipRecord } from '../src/services/dev-container-ownership-store.js';
import { DEV_CONTAINER_OWNERSHIP_LABEL } from '../src/services/dev-container-up-adapter.js';

const TOKEN = '11111111-1111-4111-8111-111111111111';
const CONTAINER_ID = 'a'.repeat(64);
const OTHER_CONTAINER_ID = 'b'.repeat(64);

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
    runtime: {
      kind: 'devcontainer',
      runtimeId: CONTAINER_ID,
    },
    lifecycle: 'ready',
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
    configSource: '.devcontainer.json',
    ownershipToken: TOKEN,
    phase: 'owned',
    containerId: CONTAINER_ID,
    claimedAt: '2026-09-24T22:30:00.000Z',
    updatedAt: '2026-09-24T22:31:00.000Z',
    ...overrides,
  };
}

function fakeStores(
  currentInstance = instance(),
  currentOwnership: DevContainerOwnershipRecord | undefined = ownership(),
) {
  const upserts: DevelopmentEnvironmentInstance[] = [];
  let released = false;
  return {
    upserts,
    released: () => released,
    environmentStore: {
      findById: (id: string) =>
        id === currentInstance.id ? currentInstance : null,
      findPrimaryByProjectId: (projectId: string) =>
        projectId === currentInstance.projectId ? currentInstance : null,
      upsert: (value: DevelopmentEnvironmentInstance) => {
        upserts.push(value);
      },
    },
    ownershipStore: {
      get: async () => currentOwnership,
      release: async () => {
        released = true;
        return true;
      },
    },
  };
}

test('cleanup prova ownership, para, verifica, remove e só então libera estado', async () => {
  const stores = fakeStores();
  const calls: Array<{ program: string; args: readonly string[] }> = [];
  let lookupCount = 0;
  const runner: DevContainerCleanupCommandRunner = async (command) => {
    calls.push(command);
    if (command.args[0] === 'container' && command.args[1] === 'ls') {
      lookupCount += 1;
      return lookupCount < 3 ? CONTAINER_ID + '\n' : '\n';
    }
    if (command.args[0] === 'inspect') {
      const running = calls.some(
        (call) => call.args[0] === 'container' && call.args[1] === 'stop',
      )
        ? 'false'
        : 'true';
      return CONTAINER_ID + '|' + TOKEN + '|' + running + '\n';
    }
    return '';
  };

  const service = new DevContainerCleanupService(
    stores.environmentStore,
    stores.ownershipStore,
    runner,
  );
  const result = await service.cleanup(project);

  assert.deepEqual(result, {
    state: 'cleaned',
    environmentInstanceId: 'environment:primary:project-1',
    containerId: CONTAINER_ID,
  });
  assert.equal(stores.released(), true);
  assert.deepEqual(
    calls.map((call) => call.args.slice(0, 2)),
    [
      ['container', 'ls'],
      ['inspect', '--type'],
      ['container', 'stop'],
      ['container', 'ls'],
      ['inspect', '--type'],
      ['container', 'rm'],
      ['container', 'ls'],
    ],
  );
  assert.equal(
    calls.some((call) => call.args.includes('--force')),
    false,
  );
  assert.equal(
    calls.some((call) => call.args.includes('--volumes')),
    false,
  );
  assert.equal(stores.upserts[0]?.lifecycle, 'stopping');
  assert.deepEqual(stores.upserts.at(-1), {
    ...instance(),
    runtime: { kind: 'host' },
    lifecycle: 'ready',
  });
});

test('cleanup ausente libera ownership sem executar stop/rm', async () => {
  const stores = fakeStores();
  const calls: Array<{ args: readonly string[] }> = [];
  const service = new DevContainerCleanupService(
    stores.environmentStore,
    stores.ownershipStore,
    async (command) => {
      calls.push(command);
      return '\n';
    },
  );

  const result = await service.cleanup(project);

  assert.deepEqual(result, {
    state: 'already-absent',
    environmentInstanceId: 'environment:primary:project-1',
  });
  assert.equal(stores.released(), true);
  assert.equal(
    calls.some(
      (call) =>
        call.args[0] === 'container' &&
        (call.args[1] === 'stop' || call.args[1] === 'rm'),
    ),
    false,
  );
  assert.equal(stores.upserts.at(-1)?.runtime.kind, 'host');
  assert.equal(stores.upserts.at(-1)?.lifecycle, 'ready');
});

test('cleanup de reserva starting usa label para recuperar container parcial', async () => {
  const stores = fakeStores(
    instance({
      runtime: { kind: 'host' },
      lifecycle: 'starting',
    }),
    ownership({
      phase: 'starting',
      containerId: undefined,
    }),
  );
  let lookupCount = 0;
  const service = new DevContainerCleanupService(
    stores.environmentStore,
    stores.ownershipStore,
    async (command) => {
      if (command.args[0] === 'container' && command.args[1] === 'ls') {
        lookupCount += 1;
        return lookupCount === 1 ? CONTAINER_ID + '\n' : '\n';
      }
      if (command.args[0] === 'inspect') {
        return CONTAINER_ID + '|' + TOKEN + '|false\n';
      }
      return '';
    },
  );

  const result = await service.cleanup(project);

  assert.equal(result.state, 'cleaned');
  assert.equal(stores.released(), true);
  assert.equal(stores.upserts.at(-1)?.runtime.kind, 'host');
});

test('container diferente do ownership persistido falha fechado sem mutation', async () => {
  const stores = fakeStores();
  const calls: Array<{ args: readonly string[] }> = [];
  const service = new DevContainerCleanupService(
    stores.environmentStore,
    stores.ownershipStore,
    async (command) => {
      calls.push(command);
      if (command.args[0] === 'container' && command.args[1] === 'ls') {
        return OTHER_CONTAINER_ID + '\n';
      }
      return '';
    },
  );

  await assert.rejects(
    () => service.cleanup(project),
    (error: unknown) =>
      error instanceof DevContainerCleanupError &&
      error.code === 'DEV_CONTAINER_CLEANUP_OWNERSHIP_MISMATCH',
  );

  assert.equal(stores.released(), false);
  assert.equal(stores.upserts.length, 0);
  assert.equal(calls.length, 1);
});

test('falha de stop mantém ownership e marca Environment Instance como failed', async () => {
  const stores = fakeStores();
  const service = new DevContainerCleanupService(
    stores.environmentStore,
    stores.ownershipStore,
    async (command) => {
      if (command.args[0] === 'container' && command.args[1] === 'ls') {
        return CONTAINER_ID + '\n';
      }
      if (command.args[0] === 'inspect') {
        return CONTAINER_ID + '|' + TOKEN + '|true\n';
      }
      if (command.args[0] === 'container' && command.args[1] === 'stop') {
        throw new Error('docker raw error');
      }
      return '';
    },
  );

  await assert.rejects(
    () => service.cleanup(project),
    (error: unknown) =>
      error instanceof DevContainerCleanupError &&
      error.code === 'DEV_CONTAINER_CLEANUP_DOCKER_STOP_FAILED' &&
      !error.message.includes('raw error'),
  );

  assert.equal(stores.released(), false);
  assert.equal(stores.upserts[0]?.lifecycle, 'stopping');
  assert.equal(stores.upserts.at(-1)?.lifecycle, 'failed');
});

test('falha ao liberar ownership é sanitizada e mantém ambiente failed', async () => {
  const current = instance({
    runtime: { kind: 'host' },
    lifecycle: 'starting',
  });
  const upserts: DevelopmentEnvironmentInstance[] = [];
  const service = new DevContainerCleanupService(
    {
      findById: () => current,
      findPrimaryByProjectId: () => current,
      upsert: (value) => upserts.push(value),
    },
    {
      get: async () =>
        ownership({
          phase: 'starting',
          containerId: undefined,
        }),
      release: async () => {
        throw new Error('filesystem raw error');
      },
    },
    async () => '\n',
  );

  await assert.rejects(
    () => service.cleanup(project),
    (error: unknown) =>
      error instanceof DevContainerCleanupError &&
      error.code === 'DEV_CONTAINER_CLEANUP_OWNERSHIP_RELEASE_FAILED' &&
      !error.message.includes('raw error'),
  );

  assert.equal(upserts.at(-1)?.lifecycle, 'failed');
});

test('inspect usa somente label de ownership conhecida e funciona com instance degraded', async () => {
  const degraded = instance({ lifecycle: 'degraded' });
  const stores = fakeStores(degraded);
  const service = new DevContainerCleanupService(
    stores.environmentStore,
    stores.ownershipStore,
    async (command) => {
      if (command.args[0] === 'container' && command.args[1] === 'ls') {
        assert.equal(
          command.args.at(-1),
          'label=' + DEV_CONTAINER_OWNERSHIP_LABEL + '=' + TOKEN,
        );
        return CONTAINER_ID + '\n';
      }
      if (command.args[0] === 'inspect') {
        return CONTAINER_ID + '|' + TOKEN + '|false\n';
      }
      return '';
    },
  );

  const result = await service.inspect(project, degraded.id);

  assert.deepEqual(result, {
    state: 'present',
    environmentInstanceId: degraded.id,
    ownership: ownership(),
    containerId: CONTAINER_ID,
    running: false,
  });
});

test('cleanup confirmado falha antes da mutation quando ownership mudou', async () => {
  const stores = fakeStores();
  const calls: Array<{ args: readonly string[] }> = [];
  const service = new DevContainerCleanupService(
    stores.environmentStore,
    stores.ownershipStore,
    async (command) => {
      calls.push(command);
      if (command.args[0] === 'container' && command.args[1] === 'ls') {
        return CONTAINER_ID + '\n';
      }
      if (command.args[0] === 'inspect') {
        return CONTAINER_ID + '|' + TOKEN + '|true\n';
      }
      return '';
    },
  );

  await assert.rejects(
    () =>
      service.cleanup(
        project,
        undefined,
        '22222222-2222-4222-8222-222222222222',
      ),
    (error: unknown) =>
      error instanceof DevContainerCleanupError &&
      error.code === 'DEV_CONTAINER_CLEANUP_OWNERSHIP_MISMATCH',
  );

  assert.equal(
    calls.some(
      (call) =>
        call.args[0] === 'container' &&
        (call.args[1] === 'stop' || call.args[1] === 'rm'),
    ),
    false,
  );
  assert.equal(stores.released(), false);
  assert.equal(stores.upserts.length, 0);
});
