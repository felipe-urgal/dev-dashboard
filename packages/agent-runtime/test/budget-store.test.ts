import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';

import { AgentBudgetStore, AgentBudgetStoreError } from '../src/index.js';

async function tempDirectory(t: TestContext): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-budget-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return directory;
}

test('persists, updates and clears a soft budget per task', async (t) => {
  const stateDirectory = await tempDirectory(t);
  const store = new AgentBudgetStore({ stateDirectory });

  assert.equal(await store.get('project-1', 'task-1'), null);

  await store.set({
    projectId: 'project-1',
    taskId: 'task-1',
    maxTotalTokens: 10_000,
    maxEstimatedCostUsd: 0.5,
    mode: 'hard',
    updatedAt: '2026-09-23T12:00:00.000Z',
  });

  assert.deepEqual(await store.get('project-1', 'task-1'), {
    projectId: 'project-1',
    taskId: 'task-1',
    maxTotalTokens: 10_000,
    maxEstimatedCostUsd: 0.5,
    mode: 'hard',
    updatedAt: '2026-09-23T12:00:00.000Z',
  });

  await store.set({
    projectId: 'project-1',
    taskId: 'task-1',
    maxEstimatedCostUsd: 1,
    updatedAt: '2026-09-23T12:01:00.000Z',
  });

  assert.deepEqual(await store.get('project-1', 'task-1'), {
    projectId: 'project-1',
    taskId: 'task-1',
    maxEstimatedCostUsd: 1,
    updatedAt: '2026-09-23T12:01:00.000Z',
  });

  await store.clear('project-1', 'task-1');
  assert.equal(await store.get('project-1', 'task-1'), null);
});

test('rejects empty or invalid budgets', async (t) => {
  const store = new AgentBudgetStore({
    stateDirectory: await tempDirectory(t),
  });

  await assert.rejects(
    store.set({
      projectId: 'project-1',
      taskId: 'task-1',
      updatedAt: '2026-09-23T12:00:00.000Z',
    }),
    (error: unknown) =>
      error instanceof AgentBudgetStoreError &&
      error.code === 'AGENT_BUDGET_INVALID',
  );

  await assert.rejects(
    store.set({
      projectId: 'project-1',
      taskId: 'task-1',
      maxTotalTokens: 0,
      updatedAt: '2026-09-23T12:00:00.000Z',
    }),
    (error: unknown) =>
      error instanceof AgentBudgetStoreError &&
      error.code === 'AGENT_BUDGET_INVALID',
  );
});
