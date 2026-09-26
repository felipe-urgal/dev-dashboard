import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';

import {
  AgentAuditStore,
  AgentConversationStore,
  AgentRuntimeStateStore,
  AgentTaskLockManager,
  AgentWorkflowRuntime,
  AgentWorkflowRuntimeError,
  GitAgentTaskStore,
  StaticAgentProviderRegistry,
  type AgentProvider,
  type AgentTaskStore,
} from '../src/index.js';

const request = {
  projectId: 'project-1',
  taskId: 'task-1',
  providerId: 'codex' as const,
  userTurn: { id: 'user-turn-1', content: 'Continue the implementation.' },
};

async function fixture(t: TestContext) {
  const root = await mkdtemp(
    path.join(tmpdir(), 'agent-conversation-recovery-'),
  );
  t.after(() => rm(root, { recursive: true, force: true }));
  const repositoryDirectory = path.join(root, 'tasks');
  const stateDirectory = path.join(root, 'runtime');
  let executions = 0;
  const provider: AgentProvider = {
    id: 'codex',
    status: async () => ({
      providerId: 'codex',
      availability: 'available',
      observedAt: '2026-09-26T12:00:00.000Z',
    }),
    execute: async () => {
      executions += 1;
      return {
        providerId: 'codex',
        outcome: 'succeeded',
        summary: 'Implementation completed.',
        responseText: 'The requested change is ready for review.',
      };
    },
  };

  // Every reopen reconstructs all stores and the runtime from disk. Only
  // the external provider and process liveness are simulated.
  function reopen(failSaveAt?: 'running' | 'review') {
    const store = new GitAgentTaskStore({ repositoryDirectory });
    const taskStore: AgentTaskStore = {
      get: (id) => store.get(id),
      list: (id) => store.list(id),
      save: async (task, version) => {
        if (task.state === failSaveAt)
          throw new Error('Injected task save failure');
        return store.save(task, version);
      },
    };
    const lockManager = new AgentTaskLockManager({ stateDirectory });
    const conversationStore = new AgentConversationStore({
      stateDirectory,
      lockManager,
    });
    const auditStore = new AgentAuditStore({ stateDirectory });
    const runtimeStateStore = new AgentRuntimeStateStore({
      stateDirectory,
      // The earlier runtime is gone when recovery is invoked in these tests.
      isProcessAlive: () => false,
    });
    const runtime = new AgentWorkflowRuntime({
      taskStore,
      conversationStore,
      runtimeStateStore,
      lockManager,
      checkpointStore: auditStore,
      executionResultStore: auditStore,
      providerRegistry: new StaticAgentProviderRegistry([provider]),
    });
    return { runtime, store };
  }

  const first = reopen();
  await first.store.save(
    {
      id: 'task-1',
      projectId: 'project-1',
      environmentInstanceId: 'env-1',
      state: 'review',
      summary: 'Implement the requested change',
      requestedCapabilities: ['workspace:write'],
      createdAt: '2026-09-26T12:00:00.000Z',
      updatedAt: '2026-09-26T12:00:00.000Z',
    },
    null,
  );
  return { ...first, reopen, executions: () => executions };
}

function hasCode(code: AgentWorkflowRuntimeError['code']) {
  return (error: unknown) =>
    error instanceof AgentWorkflowRuntimeError && error.code === code;
}

test('completed conversation survives reopening and rejects replay of its turn', async (t) => {
  const f = await fixture(t);
  const result = await f.runtime.execute(request);
  const before = await f.runtime.conversation('project-1', 'task-1');
  assert.equal(before.length, 2);
  assert.equal(before[1]?.executionId, result.execution.id);
  assert.equal(before[1]?.providerId, 'codex');
  assert.equal(before[1]?.content, 'The requested change is ready for review.');

  const restarted = f.reopen();
  assert.deepEqual(await restarted.runtime.recoverInterrupted('project-1'), []);
  for (const content of [
    request.userTurn.content,
    'Different instruction, same ID.',
  ]) {
    await assert.rejects(
      restarted.runtime.execute({
        ...request,
        userTurn: { ...request.userTurn, content },
      }),
      hasCode('AGENT_WORKFLOW_TURN_ALREADY_SUBMITTED'),
    );
  }
  assert.equal(f.executions(), 1);
  assert.deepEqual(
    await restarted.runtime.conversation('project-1', 'task-1'),
    before,
  );
  assert.deepEqual(await restarted.store.get('task-1'), result.task);
});

test('persisted user turn is not dispatched again after failure before running is saved', async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    f.reopen('running').runtime.execute(request),
    /Injected task save failure/,
  );
  assert.equal(f.executions(), 0);

  const restarted = f.reopen();
  assert.deepEqual(await restarted.runtime.recoverInterrupted('project-1'), []);
  await assert.rejects(
    restarted.runtime.execute(request),
    hasCode('AGENT_WORKFLOW_TURN_ALREADY_SUBMITTED'),
  );
  const turns = await restarted.runtime.conversation('project-1', 'task-1');
  assert.equal(turns.length, 1);
  assert.equal(turns[0]?.id, 'user-turn-1');
  assert.equal(turns[0]?.role, 'user');
  assert.equal((await restarted.store.get('task-1'))?.task.state, 'review');
  assert.equal(f.executions(), 0);
});

test('recovery after response persistence preserves turns without replaying ambiguous execution', async (t) => {
  const f = await fixture(t);
  const interrupted = f.reopen('review');
  await assert.rejects(
    interrupted.runtime.execute(request),
    /Injected task save failure/,
  );
  const before = await interrupted.runtime.conversation('project-1', 'task-1');
  assert.equal(before.length, 2);
  const canonical = await interrupted.store.get('task-1');
  assert.equal(canonical?.task.state, 'running');

  const restarted = f.reopen();
  assert.deepEqual(await restarted.runtime.recoverInterrupted('project-1'), [
    'task-1',
  ]);
  assert.equal(
    (await restarted.runtime.status('project-1', 'task-1')).runtime.state,
    'interrupted',
  );
  await restarted.runtime.recover('project-1', 'task-1');
  assert.equal(
    (await restarted.runtime.status('project-1', 'task-1')).runtime.state,
    'idle',
  );

  // Recover resets runtime bookkeeping, not canonical authority. An ambiguous
  // running task must not be silently reopened or sent to the provider again.
  await assert.rejects(
    restarted.runtime.execute(request),
    hasCode('AGENT_WORKFLOW_TASK_NOT_RUNNABLE'),
  );
  const { userTurn: _turn, ...withoutTurn } = request;
  await assert.rejects(
    restarted.runtime.execute(withoutTurn),
    hasCode('AGENT_WORKFLOW_TASK_NOT_RUNNABLE'),
  );
  await assert.rejects(
    restarted.runtime.recover('project-1', 'task-1'),
    /not interrupted/,
  );
  assert.deepEqual(await restarted.runtime.recoverInterrupted('project-1'), []);
  assert.deepEqual(
    await restarted.runtime.conversation('project-1', 'task-1'),
    before,
  );
  assert.deepEqual(await restarted.store.get('task-1'), canonical);
  assert.equal(f.executions(), 1);
});
