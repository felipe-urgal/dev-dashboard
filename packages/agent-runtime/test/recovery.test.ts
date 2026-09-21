import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  AgentRuntimeStateStore,
  AgentTaskLockError,
  AgentTaskLockManager,
  type AgentTaskRecord,
} from '../src/index.js';

function record(version = 1): AgentTaskRecord {
  return {
    version,
    task: {
      id: 'task-1',
      projectId: 'project-1',
      state: 'queued',
      summary: 'Implement change',
      requestedCapabilities: ['workspace:write'],
      createdAt: '2026-09-21T22:00:00.000Z',
      updatedAt: '2026-09-21T22:00:00.000Z',
    },
  };
}

test('task lock blocks a second live owner and releases by owner token', async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), 'agent-lock-'));
  context.after(async () => rm(root, { recursive: true, force: true }));

  const alive = new Set([100, 200]);
  const first = new AgentTaskLockManager({
    stateDirectory: root,
    processId: 100,
    isProcessAlive: (processId) => alive.has(processId),
  });
  const second = new AgentTaskLockManager({
    stateDirectory: root,
    processId: 200,
    isProcessAlive: (processId) => alive.has(processId),
  });

  const release = await first.acquire('project-1__task-1');

  await assert.rejects(
    () => second.acquire('project-1__task-1'),
    (error: unknown) =>
      error instanceof AgentTaskLockError && error.code === 'AGENT_TASK_LOCKED',
  );

  await release();
  const secondRelease = await second.acquire('project-1__task-1');
  await secondRelease();
});

test('task lock reclaims a stale owner', async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), 'agent-lock-stale-'));
  context.after(async () => rm(root, { recursive: true, force: true }));

  const first = new AgentTaskLockManager({
    stateDirectory: root,
    processId: 100,
    isProcessAlive: (processId) => processId === 100,
  });
  const release = await first.acquire('task-1');

  const second = new AgentTaskLockManager({
    stateDirectory: root,
    processId: 200,
    isProcessAlive: () => false,
  });
  const secondRelease = await second.acquire('task-1');

  await release();
  await secondRelease();
});

test('dead running execution becomes interrupted when canonical task is unchanged', async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), 'agent-runtime-'));
  context.after(async () => rm(root, { recursive: true, force: true }));

  const store = new AgentRuntimeStateStore({
    stateDirectory: root,
    processId: 100,
    isProcessAlive: () => false,
    now: () => new Date('2026-09-21T22:10:00.000Z'),
  });

  await store.markRunning(record(), 'execution-1');
  const recovered = await store.recoverInterrupted([record()]);
  const state = await store.read(record());

  assert.deepEqual(recovered, ['task-1']);
  assert.equal(state.state, 'interrupted');
  assert.equal(state.executionId, 'execution-1');
  assert.equal(state.processId, undefined);
  assert.equal(state.lastReason, 'process-interrupted');
});

test('canonical version advance wins over interrupted runtime state', async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), 'agent-runtime-version-'));
  context.after(async () => rm(root, { recursive: true, force: true }));

  const store = new AgentRuntimeStateStore({
    stateDirectory: root,
    processId: 100,
    isProcessAlive: () => false,
    now: () => new Date('2026-09-21T22:11:00.000Z'),
  });

  await store.markRunning(record(1), 'execution-1');
  await store.recoverInterrupted([record(2)]);
  const state = await store.read(record(2));

  assert.equal(state.state, 'idle');
  assert.equal(state.canonicalVersion, 2);
  assert.equal(state.executionId, undefined);
  assert.equal(state.attempts, 0);
  assert.equal(state.lastReason, 'canonical-task-advanced');
});

test('interrupted task requires explicit recovery before returning to idle', async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), 'agent-runtime-recover-'));
  context.after(async () => rm(root, { recursive: true, force: true }));

  const store = new AgentRuntimeStateStore({
    stateDirectory: root,
    processId: 100,
    isProcessAlive: () => false,
    now: () => new Date('2026-09-21T22:12:00.000Z'),
  });

  await store.markRunning(record(), 'execution-1');
  await store.recoverInterrupted([record()]);
  const recovered = await store.recoverTask(record());

  assert.equal(recovered.state, 'idle');
  assert.equal(recovered.executionId, undefined);
  assert.equal(recovered.lastReason, 'operator-recovered');
});

test('corrupted runtime state fails closed instead of being reset silently', async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), 'agent-runtime-invalid-'));
  context.after(async () => rm(root, { recursive: true, force: true }));

  const store = new AgentRuntimeStateStore({ stateDirectory: root });
  await store.read(record());

  const runtimeDirectory = path.join(root, 'runtime');
  await mkdir(runtimeDirectory, { recursive: true });
  await writeFile(
    path.join(runtimeDirectory, 'broken.json'),
    '{"state":"running"',
  );

  await assert.rejects(() => store.recoverInterrupted([record()]));
});
