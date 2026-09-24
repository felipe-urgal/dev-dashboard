import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  DevContainerOwnershipStore,
  DevContainerOwnershipStoreError,
} from '../src/services/dev-container-ownership-store.js';

const TOKEN_A = '11111111-1111-4111-8111-111111111111';
const TOKEN_B = '22222222-2222-4222-8222-222222222222';
const CONTAINER_A = 'a'.repeat(64);
const CONTAINER_B = 'b'.repeat(64);

test('ownership Dev Container reserva antes do runtime e sobrevive restart', async (context) => {
  const root = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-devcontainer-owner-'),
  );
  context.after(async () => rm(root, { recursive: true, force: true }));
  const statePath = path.join(root, 'ownership.json');
  let now = new Date('2026-09-24T22:30:00.000Z');

  const store = new DevContainerOwnershipStore(statePath, {
    now: () => now,
    createOwnershipToken: () => TOKEN_A,
  });
  const reserved = await store.reserve({
    projectId: 'project-1',
    environmentInstanceId: 'environment:primary:project-1',
    projectPath: '/workspace/project-1',
    configSource: '.devcontainer/devcontainer.json',
  });

  assert.equal(reserved.phase, 'starting');
  assert.equal(reserved.containerId, undefined);
  assert.equal(reserved.ownershipToken, TOKEN_A);

  const persisted = JSON.parse(await readFile(statePath, 'utf8')) as {
    records: Array<{ ownershipToken: string; phase: string }>;
  };
  assert.deepEqual(persisted.records, [{ ...reserved }]);

  now = new Date('2026-09-24T22:31:00.000Z');
  const reloaded = new DevContainerOwnershipStore(statePath, {
    now: () => now,
    createOwnershipToken: () => TOKEN_B,
  });
  assert.deepEqual(
    await reloaded.get({
      projectId: 'project-1',
      environmentInstanceId: 'environment:primary:project-1',
      projectPath: '/workspace/project-1',
    }),
    reserved,
  );
});

test('ownership Dev Container não sobrescreve Environment Instance ou path já reservado', async (context) => {
  const root = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-devcontainer-owner-'),
  );
  context.after(async () => rm(root, { recursive: true, force: true }));
  let token = TOKEN_A;
  const store = new DevContainerOwnershipStore(
    path.join(root, 'ownership.json'),
    {
      createOwnershipToken: () => token,
    },
  );

  await store.reserve({
    projectId: 'project-1',
    environmentInstanceId: 'environment:primary:project-1',
    projectPath: '/workspace/project-1',
    configSource: '.devcontainer.json',
  });

  token = TOKEN_B;
  await assert.rejects(
    () =>
      store.reserve({
        projectId: 'project-1',
        environmentInstanceId: 'environment:primary:project-1',
        projectPath: '/workspace/other',
        configSource: '.devcontainer.json',
      }),
    (error: unknown) =>
      error instanceof DevContainerOwnershipStoreError &&
      error.code === 'DEV_CONTAINER_OWNERSHIP_EXISTS',
  );
  await assert.rejects(
    () =>
      store.reserve({
        projectId: 'project-1',
        environmentInstanceId: 'environment:worktree:project-1:duplicate',
        projectPath: '/workspace/project-1',
        configSource: '.devcontainer.json',
      }),
    (error: unknown) =>
      error instanceof DevContainerOwnershipStoreError &&
      error.code === 'DEV_CONTAINER_OWNERSHIP_EXISTS',
  );
});

test('ownership Dev Container associa apenas containerId estruturado à reserva exata', async (context) => {
  const root = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-devcontainer-owner-'),
  );
  context.after(async () => rm(root, { recursive: true, force: true }));
  const store = new DevContainerOwnershipStore(
    path.join(root, 'ownership.json'),
    {
      now: () => new Date('2026-09-24T22:32:00.000Z'),
      createOwnershipToken: () => TOKEN_A,
    },
  );

  await store.reserve({
    projectId: 'project-1',
    environmentInstanceId: 'environment:primary:project-1',
    projectPath: '/workspace/project-1',
    configSource: '.devcontainer.json',
  });
  const owned = await store.attach({
    environmentInstanceId: 'environment:primary:project-1',
    ownershipToken: TOKEN_A,
    containerId: CONTAINER_A,
  });

  assert.equal(owned.phase, 'owned');
  assert.equal(owned.containerId, CONTAINER_A);
  assert.deepEqual(
    await store.attach({
      environmentInstanceId: owned.environmentInstanceId,
      ownershipToken: TOKEN_A,
      containerId: CONTAINER_A,
    }),
    owned,
  );

  await assert.rejects(
    () =>
      store.attach({
        environmentInstanceId: owned.environmentInstanceId,
        ownershipToken: TOKEN_A,
        containerId: CONTAINER_B,
      }),
    (error: unknown) =>
      error instanceof DevContainerOwnershipStoreError &&
      error.code === 'DEV_CONTAINER_OWNERSHIP_MISMATCH',
  );
  await assert.rejects(
    () =>
      store.attach({
        environmentInstanceId: owned.environmentInstanceId,
        ownershipToken: TOKEN_B,
        containerId: CONTAINER_A,
      }),
    (error: unknown) =>
      error instanceof DevContainerOwnershipStoreError &&
      error.code === 'DEV_CONTAINER_OWNERSHIP_MISMATCH',
  );
});

test('release exige projeto, Environment Instance, path e token exatos', async (context) => {
  const root = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-devcontainer-owner-'),
  );
  context.after(async () => rm(root, { recursive: true, force: true }));
  const store = new DevContainerOwnershipStore(
    path.join(root, 'ownership.json'),
    {
      createOwnershipToken: () => TOKEN_A,
    },
  );

  await store.reserve({
    projectId: 'project-1',
    environmentInstanceId: 'environment:primary:project-1',
    projectPath: '/workspace/project-1',
    configSource: '.devcontainer.json',
  });

  assert.equal(
    await store.release({
      projectId: 'project-1',
      environmentInstanceId: 'environment:primary:project-1',
      projectPath: '/workspace/project-1',
      ownershipToken: TOKEN_B,
    }),
    false,
  );
  assert.equal(
    await store.release({
      projectId: 'project-1',
      environmentInstanceId: 'environment:primary:project-1',
      projectPath: '/workspace/project-1',
      ownershipToken: TOKEN_A,
    }),
    true,
  );
  assert.equal(
    await store.get({
      projectId: 'project-1',
      environmentInstanceId: 'environment:primary:project-1',
      projectPath: '/workspace/project-1',
    }),
    undefined,
  );
});

test('estado persistido inválido falha fechado em vez de parecer sem ownership', async (context) => {
  const root = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-devcontainer-owner-'),
  );
  context.after(async () => rm(root, { recursive: true, force: true }));
  const statePath = path.join(root, 'ownership.json');
  await writeFile(statePath, '{"version":1,"records":"corrompido"}\n');

  const store = new DevContainerOwnershipStore(statePath);
  await assert.rejects(
    () =>
      store.get({
        projectId: 'project-1',
        environmentInstanceId: 'environment:primary:project-1',
        projectPath: '/workspace/project-1',
      }),
    (error: unknown) =>
      error instanceof DevContainerOwnershipStoreError &&
      error.code === 'DEV_CONTAINER_OWNERSHIP_STATE_INVALID',
  );
});
