import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test, { type TestContext } from 'node:test';

import {
  GitAgentTaskStore,
  GitAgentTaskStoreError,
  type AgentTask,
  type GitAgentTaskStoreErrorCode,
} from '../src/index.js';

const execFileAsync = promisify(execFile);

function agentTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 'task-1',
    projectId: 'project-1',
    state: 'queued',
    summary: 'Implement the requested change',
    requestedCapabilities: ['workspace:write'],
    createdAt: '2026-09-22T13:00:00.000Z',
    updatedAt: '2026-09-22T13:00:00.000Z',
    ...overrides,
  };
}

async function fixture(t: TestContext): Promise<{
  repositoryDirectory: string;
  store: GitAgentTaskStore;
}> {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), 'dev-dashboard-agent-task-store-'),
  );
  const repositoryDirectory = path.join(root, 'canonical-tasks');

  t.after(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  return {
    repositoryDirectory,
    store: new GitAgentTaskStore({ repositoryDirectory }),
  };
}

function hasStoreCode(
  error: unknown,
  code: GitAgentTaskStoreErrorCode,
): boolean {
  return error instanceof GitAgentTaskStoreError && error.code === code;
}

test('creates a private canonical Git store and versions task updates', async (t) => {
  const { repositoryDirectory, store } = await fixture(t);

  const created = await store.save(agentTask(), null);
  assert.equal(created.version, 0);

  const updated = await store.save(
    agentTask({
      state: 'running',
      summary: 'Implementation started',
      updatedAt: '2026-09-22T13:01:00.000Z',
    }),
    0,
  );

  assert.equal(updated.version, 1);
  assert.equal((await store.get('task-1'))?.task.state, 'running');
  assert.deepEqual(
    (await store.list('project-1')).map((record) => record.task.id),
    ['task-1'],
  );
  assert.deepEqual(await store.list('another-project'), []);

  const { stdout } = await execFileAsync(
    'git',
    ['rev-list', '--count', 'HEAD'],
    { cwd: repositoryDirectory },
  );
  assert.equal(stdout.trim(), '3');

  const marker = await fs.readFile(
    path.join(repositoryDirectory, '.dev-dashboard-agent-store.json'),
    'utf8',
  );
  assert.match(marker, /dev-dashboard-agent-runtime/u);
});

test('persiste Task Context junto da task e recupera após reabrir o store', async (t) => {
  const { repositoryDirectory, store } = await fixture(t);

  await store.save(
    agentTask({
      environmentInstanceId: 'environment:worktree:project-1:worktree-1',
      taskContextId: 'context-1',
    }),
    null,
  );

  const reopened = new GitAgentTaskStore({ repositoryDirectory });
  const restored = await reopened.get('task-1');

  assert.equal(restored?.task.taskContextId, 'context-1');
  assert.equal(
    restored?.task.environmentInstanceId,
    'environment:worktree:project-1:worktree-1',
  );
});

test('rejects stale expected versions without changing canonical state', async (t) => {
  const { store } = await fixture(t);
  await store.save(agentTask(), null);
  await store.save(
    agentTask({
      summary: 'First update',
      updatedAt: '2026-09-22T13:01:00.000Z',
    }),
    0,
  );

  await assert.rejects(
    () =>
      store.save(
        agentTask({
          summary: 'Stale update',
          updatedAt: '2026-09-22T13:02:00.000Z',
        }),
        0,
      ),
    (error: unknown) => hasStoreCode(error, 'AGENT_TASK_STORE_CONFLICT'),
  );

  const current = await store.get('task-1');
  assert.equal(current?.version, 1);
  assert.equal(current?.task.summary, 'First update');
});

test('serializes concurrent saves so only one writer wins a version', async (t) => {
  const { store } = await fixture(t);
  await store.save(agentTask(), null);

  const results = await Promise.allSettled([
    store.save(
      agentTask({
        summary: 'Writer A',
        updatedAt: '2026-09-22T13:01:00.000Z',
      }),
      0,
    ),
    store.save(
      agentTask({
        summary: 'Writer B',
        updatedAt: '2026-09-22T13:01:00.000Z',
      }),
      0,
    ),
  ]);

  assert.equal(
    results.filter((result) => result.status === 'fulfilled').length,
    1,
  );
  assert.equal(
    results.filter(
      (result) =>
        result.status === 'rejected' &&
        hasStoreCode(result.reason, 'AGENT_TASK_STORE_CONFLICT'),
    ).length,
    1,
  );

  const current = await store.get('task-1');
  assert.equal(current?.version, 1);
  assert.ok(
    current?.task.summary === 'Writer A' ||
      current?.task.summary === 'Writer B',
  );
});

test('rejects invalid workflow transitions and immutable identity changes', async (t) => {
  const { store } = await fixture(t);
  await store.save(agentTask(), null);

  await assert.rejects(
    () =>
      store.save(
        agentTask({
          state: 'completed',
          updatedAt: '2026-09-22T13:01:00.000Z',
        }),
        0,
      ),
    (error: unknown) => hasStoreCode(error, 'AGENT_TASK_STORE_INVALID'),
  );

  await assert.rejects(
    () =>
      store.save(
        agentTask({
          projectId: 'project-2',
          updatedAt: '2026-09-22T13:01:00.000Z',
        }),
        0,
      ),
    (error: unknown) => hasStoreCode(error, 'AGENT_TASK_STORE_INVALID'),
  );

  await assert.rejects(
    () =>
      store.save(
        agentTask({
          createdAt: '2026-09-22T12:59:00.000Z',
          updatedAt: '2026-09-22T13:01:00.000Z',
        }),
        0,
      ),
    (error: unknown) => hasStoreCode(error, 'AGENT_TASK_STORE_INVALID'),
  );

  assert.equal((await store.get('task-1'))?.task.state, 'queued');
});

test('refuses an existing Git repository that is not owned by the runtime', async (t) => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), 'dev-dashboard-agent-foreign-store-'),
  );
  t.after(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  await execFileAsync('git', ['init', '--initial-branch=main'], {
    cwd: root,
  });

  const store = new GitAgentTaskStore({
    repositoryDirectory: root,
  });

  await assert.rejects(
    () => store.get('task-1'),
    (error: unknown) =>
      hasStoreCode(error, 'AGENT_TASK_STORE_GIT') ||
      hasStoreCode(error, 'AGENT_TASK_STORE_INVALID'),
  );
});

test('fails closed when the managed repository becomes dirty', async (t) => {
  const { repositoryDirectory, store } = await fixture(t);
  await store.save(agentTask(), null);

  const taskRecord = await store.get('task-1');
  assert.ok(taskRecord);

  const taskFiles = await fs.readdir(path.join(repositoryDirectory, 'tasks'));
  assert.equal(taskFiles.length, 1);

  await fs.appendFile(
    path.join(repositoryDirectory, 'tasks', taskFiles[0] as string),
    '\n',
  );

  await assert.rejects(
    () => store.get('task-1'),
    (error: unknown) => hasStoreCode(error, 'AGENT_TASK_STORE_CORRUPT'),
  );
});
