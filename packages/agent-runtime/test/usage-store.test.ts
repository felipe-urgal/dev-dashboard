import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  AgentUsageStore,
  AgentUsageStoreError,
  type AgentUsageRecord,
} from '../src/index.js';

async function tempDirectory(t: test.TestContext): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-usage-'));
  t.after(async () => {
    await fs.rm(directory, { recursive: true, force: true });
  });
  return directory;
}

function record(
  executionId: string,
  overrides: Partial<AgentUsageRecord> = {},
): AgentUsageRecord {
  return {
    executionId,
    taskId: 'task-1',
    projectId: 'project-1',
    providerId: 'codex',
    observedAt: '2026-09-23T15:00:00.000Z',
    usage: {
      providerId: 'codex',
      source: 'provider',
      inputTokens: 100,
      cachedInputTokens: 20,
      outputTokens: 30,
      durationMs: 1_500,
    },
    ...overrides,
  };
}

test('persists bounded sanitized usage records and aggregates filters', async (t) => {
  const stateDirectory = await tempDirectory(t);
  const store = new AgentUsageStore({
    stateDirectory,
    maxRecords: 3,
  });

  await store.append(record('execution-1'));
  await store.append(
    record('execution-2', {
      providerId: 'claude-code',
      usage: {
        providerId: 'claude-code',
        source: 'provider',
        model: 'claude-sonnet-test',
        inputTokens: 50,
        cacheWriteInputTokens: 10,
        outputTokens: 12,
        reportedCost: { amount: 0.02, currency: 'USD' },
        durationMs: 2_500,
      },
    }),
  );
  await store.append(
    record('execution-3', {
      taskId: 'task-2',
      usage: {
        providerId: 'codex',
        source: 'provider',
        reasoningTokens: 7,
        totalTokens: 80,
      },
    }),
  );
  await store.append(
    record('execution-4', {
      projectId: 'project-2',
      taskId: 'task-3',
    }),
  );

  assert.deepEqual(
    (await store.list()).map((item) => item.executionId),
    ['execution-2', 'execution-3', 'execution-4'],
  );

  assert.deepEqual(await store.summary({ projectId: 'project-1' }), {
    executionCount: 2,
    inputTokens: 50,
    cacheWriteInputTokens: 10,
    outputTokens: 12,
    reasoningTokens: 7,
    totalTokens: 80,
    reportedCostUsd: 0.02,
    durationMs: 2_500,
  });

  assert.deepEqual(
    await store.summary({
      projectId: 'project-1',
      providerId: 'claude-code',
    }),
    {
      executionCount: 1,
      inputTokens: 50,
      cacheWriteInputTokens: 10,
      outputTokens: 12,
      reportedCostUsd: 0.02,
      durationMs: 2_500,
    },
  );
});

test('append is idempotent by execution id and rejects conflicting usage', async (t) => {
  const stateDirectory = await tempDirectory(t);
  const store = new AgentUsageStore({ stateDirectory });
  const first = record('execution-1');

  await store.append(first);
  await store.append(first);
  assert.equal((await store.list()).length, 1);

  await assert.rejects(
    () =>
      store.append(
        record('execution-1', {
          usage: {
            providerId: 'codex',
            source: 'provider',
            inputTokens: 999,
          },
        }),
      ),
    (error: unknown) =>
      error instanceof AgentUsageStoreError &&
      error.code === 'AGENT_USAGE_CONFLICT',
  );
});

test('rejects provider mismatch and corrupt persisted state', async (t) => {
  const stateDirectory = await tempDirectory(t);
  const store = new AgentUsageStore({ stateDirectory });

  await assert.rejects(
    () =>
      store.append({
        ...record('execution-1'),
        providerId: 'claude-code',
      }),
    (error: unknown) =>
      error instanceof AgentUsageStoreError &&
      error.code === 'AGENT_USAGE_INVALID',
  );

  const usageDirectory = path.join(stateDirectory, 'usage');
  await fs.mkdir(usageDirectory, { recursive: true });
  await fs.writeFile(path.join(usageDirectory, 'usage.json'), '{broken');

  await assert.rejects(
    () => store.list(),
    (error: unknown) =>
      error instanceof AgentUsageStoreError &&
      error.code === 'AGENT_USAGE_CORRUPT',
  );
});
