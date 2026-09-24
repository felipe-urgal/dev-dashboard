import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';

import {
  AgentAuditStore,
  AgentRuntimeStateStore,
  AgentTaskLockError,
  AgentTaskLockManager,
  AgentWorkflowRuntime,
  AgentWorkflowRuntimeError,
  StaticAgentProviderRegistry,
  type AgentAuthorization,
  type AgentProvider,
  type AgentProviderExecutionRequest,
  type AgentProviderResult,
  type AgentTask,
  type AgentTaskRecord,
  type AgentTaskStore,
} from '../src/index.js';

function task(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 'task-1',
    projectId: 'project-1',
    environmentInstanceId: 'env-1',
    state: 'queued',
    summary: 'Implement the requested change',
    requestedCapabilities: ['workspace:write', 'git:push'],
    createdAt: '2026-09-22T15:00:00.000Z',
    updatedAt: '2026-09-22T15:00:00.000Z',
    ...overrides,
  };
}

function cloneRecord(record: AgentTaskRecord): AgentTaskRecord {
  return {
    version: record.version,
    task: {
      ...record.task,
      requestedCapabilities: [...record.task.requestedCapabilities],
    },
  };
}

class MemoryTaskStore implements AgentTaskStore {
  private record: AgentTaskRecord;

  public constructor(initial: AgentTask) {
    this.record = { task: initial, version: 0 };
  }

  async get(taskId: string): Promise<AgentTaskRecord | null> {
    return this.record.task.id === taskId ? cloneRecord(this.record) : null;
  }

  async list(projectId: string): Promise<AgentTaskRecord[]> {
    return this.record.task.projectId === projectId
      ? [cloneRecord(this.record)]
      : [];
  }

  async save(
    next: AgentTask,
    expectedVersion: number | null,
  ): Promise<AgentTaskRecord> {
    if (expectedVersion !== this.record.version) {
      throw new Error('version conflict');
    }

    this.record = {
      task: {
        ...next,
        requestedCapabilities: [...next.requestedCapabilities],
      },
      version: this.record.version + 1,
    };
    return cloneRecord(this.record);
  }
}

class StubProvider implements AgentProvider {
  readonly id = 'codex' as const;
  lastRequest: AgentProviderExecutionRequest | undefined;

  public constructor(
    private readonly executeImpl: (
      request: AgentProviderExecutionRequest,
    ) => Promise<AgentProviderResult>,
  ) {}

  async status() {
    return {
      providerId: this.id,
      availability: 'available' as const,
      observedAt: '2026-09-22T15:00:00.000Z',
    };
  }

  async execute(
    request: AgentProviderExecutionRequest,
  ): Promise<AgentProviderResult> {
    this.lastRequest = request;
    return this.executeImpl(request);
  }
}

async function fixture(
  t: TestContext,
  provider: StubProvider,
  initialTask = task(),
  retryPolicy: {
    maxExecutionAttempts?: number;
    retryBackoffMs?: number;
    maxRetryBackoffMs?: number;
  } = {},
) {
  const root = await mkdtemp(path.join(tmpdir(), 'agent-workflow-runtime-'));
  t.after(async () => rm(root, { recursive: true, force: true }));

  let tick = 0;
  let clockOffsetMs = 0;
  const base = Date.parse('2026-09-22T15:00:00.000Z');
  const now = () => new Date(base + clockOffsetMs + tick++).toISOString();
  const store = new MemoryTaskStore(initialTask);
  const auditStore = new AgentAuditStore({
    stateDirectory: root,
  });
  const runtimeStateStore = new AgentRuntimeStateStore({
    stateDirectory: root,
    processId: 101,
    isProcessAlive: (processId) => processId === 101,
    now: () => new Date(base + tick++),
  });
  const lockManager = new AgentTaskLockManager({
    stateDirectory: root,
    processId: 101,
    isProcessAlive: (processId) => processId === 101,
  });
  const runtime = new AgentWorkflowRuntime({
    taskStore: store,
    providerRegistry: new StaticAgentProviderRegistry([provider]),
    runtimeStateStore,
    lockManager,
    checkpointStore: auditStore,
    now,
    createExecutionId: () => 'execution-1',
    createCheckpointId: () => 'checkpoint-1',
    retryBackoffMs: 0,
    ...retryPolicy,
  });

  return {
    runtime,
    store,
    runtimeStateStore,
    auditStore,
    advanceTime: (milliseconds: number) => {
      clockOffsetMs += milliseconds;
    },
  };
}

function authorizations(): AgentAuthorization[] {
  return [
    {
      taskId: 'task-1',
      capability: 'workspace:write',
      granted: true,
      observedAt: '2026-09-22T15:00:00.000Z',
    },
    {
      taskId: 'task-1',
      capability: 'deployment:run',
      granted: true,
      observedAt: '2026-09-22T15:00:00.000Z',
    },
  ];
}

test('executes one queued task and only forwards explicitly requested grants', async (t) => {
  const provider = new StubProvider(async () => ({
    providerId: 'codex',
    outcome: 'succeeded',
    summary: 'Implementation finished',
    usage: {
      providerId: 'codex',
      source: 'provider',
      inputTokens: 120,
      outputTokens: 30,
    },
  }));
  const { runtime, store, runtimeStateStore } = await fixture(t, provider);

  const result = await runtime.execute({
    projectId: 'project-1',
    taskId: 'task-1',
    providerId: 'codex',
    authorizations: authorizations(),
  });

  assert.equal(result.task.task.state, 'review');
  assert.equal(result.execution.state, 'succeeded');
  assert.equal(result.execution.providerId, 'codex');
  assert.equal(result.execution.requestedProviderId, 'codex');
  assert.deepEqual(result.execution.usage, {
    providerId: 'codex',
    source: 'provider',
    inputTokens: 120,
    outputTokens: 30,
  });
  assert.deepEqual(provider.lastRequest?.allowedCapabilities, [
    'workspace:write',
  ]);

  const persisted = await store.get('task-1');
  assert.equal(persisted?.task.state, 'review');
  assert.equal((await runtimeStateStore.read(persisted!)).state, 'idle');
});

test('provider checkpoint pausa task e aprovação explícita persiste continuação', async (t) => {
  const provider = new StubProvider(async (request) => {
    if (request.continuationInstruction) {
      return {
        providerId: 'codex',
        outcome: 'succeeded',
        summary: 'Continued successfully',
      };
    }

    return {
      providerId: 'codex',
      outcome: 'checkpoint',
      summary: 'Approval required',
      checkpoint: {
        summary: 'Allow workspace write before continuing.',
        requiredCapabilities: ['workspace:write'],
      },
    };
  });
  const { runtime, store, auditStore } = await fixture(t, provider);

  const paused = await runtime.execute({
    projectId: 'project-1',
    taskId: 'task-1',
    providerId: 'codex',
  });

  assert.equal(paused.task.task.state, 'checkpoint');
  assert.equal(paused.execution.state, 'checkpoint');
  assert.equal(paused.checkpoint?.id, 'checkpoint-1');
  assert.equal(paused.checkpoint?.status, 'pending');
  assert.equal((await auditStore.snapshot('task-1')).checkpoints.length, 1);

  const approved = await runtime.resolveCheckpoint(
    'project-1',
    'task-1',
    'checkpoint-1',
    'approved',
    'Continue with the requested workspace change.',
  );

  assert.equal(approved.task.task.state, 'queued');
  assert.equal(
    approved.task.task.continuationInstruction,
    'Continue with the requested workspace change.',
  );
  assert.equal(approved.checkpoint.status, 'approved');

  const continued = await runtime.execute({
    projectId: 'project-1',
    taskId: 'task-1',
    providerId: 'codex',
  });

  assert.equal(continued.task.task.state, 'review');
  assert.equal(
    provider.lastRequest?.continuationInstruction,
    'Continue with the requested workspace change.',
  );
  assert.equal(
    (await store.get('task-1'))?.task.continuationInstruction,
    undefined,
  );
});

test('rejected checkpoint blocks task and pending checkpoint prevents execution', async (t) => {
  const provider = new StubProvider(async () => ({
    providerId: 'codex',
    outcome: 'checkpoint',
    summary: 'Approval required',
    checkpoint: {
      summary: 'Need permission.',
      requiredCapabilities: [],
    },
  }));
  const { runtime } = await fixture(t, provider);

  await runtime.execute({
    projectId: 'project-1',
    taskId: 'task-1',
    providerId: 'codex',
  });

  await assert.rejects(
    () =>
      runtime.execute({
        projectId: 'project-1',
        taskId: 'task-1',
        providerId: 'codex',
      }),
    (error: unknown) =>
      error instanceof AgentWorkflowRuntimeError &&
      error.code === 'AGENT_WORKFLOW_TASK_NOT_RUNNABLE',
  );

  const rejected = await runtime.resolveCheckpoint(
    'project-1',
    'task-1',
    'checkpoint-1',
    'rejected',
  );
  assert.equal(rejected.task.task.state, 'blocked');

  await assert.rejects(
    () =>
      runtime.resolveCheckpoint(
        'project-1',
        'task-1',
        'checkpoint-1',
        'approved',
      ),
    (error: unknown) =>
      error instanceof AgentWorkflowRuntimeError &&
      error.code === 'AGENT_WORKFLOW_CHECKPOINT_NOT_PENDING',
  );
});

test('ambiguous provider result blocks the task and cannot use automatic retry', async (t) => {
  const provider = new StubProvider(async () => ({
    providerId: 'codex',
    outcome: 'unknown',
    summary: 'Provider result is ambiguous',
    failure: {
      kind: 'ambiguous',
      code: 'provider-exit-unknown',
      message: 'Provider exit could not be confirmed',
    },
  }));
  const { runtime } = await fixture(t, provider);

  const result = await runtime.execute({
    projectId: 'project-1',
    taskId: 'task-1',
    providerId: 'codex',
  });

  assert.equal(result.task.task.state, 'blocked');
  assert.equal(result.execution.state, 'unknown');

  await assert.rejects(
    () => runtime.retry('project-1', 'task-1'),
    (error: unknown) =>
      error instanceof AgentWorkflowRuntimeError &&
      error.code === 'AGENT_WORKFLOW_RETRY_NOT_ALLOWED',
  );
});

test('unnormalized provider errors fail closed as blocked', async (t) => {
  const provider = new StubProvider(async () => {
    throw new Error('raw provider failure');
  });
  const { runtime, store } = await fixture(t, provider);

  await assert.rejects(
    () =>
      runtime.execute({
        projectId: 'project-1',
        taskId: 'task-1',
        providerId: 'codex',
      }),
    (error: unknown) =>
      error instanceof AgentWorkflowRuntimeError &&
      error.code === 'AGENT_WORKFLOW_PROVIDER_FAILED',
  );

  assert.equal((await store.get('task-1'))?.task.state, 'blocked');
  await assert.rejects(
    () => runtime.retry('project-1', 'task-1'),
    (error: unknown) =>
      error instanceof AgentWorkflowRuntimeError &&
      error.code === 'AGENT_WORKFLOW_RETRY_NOT_ALLOWED',
  );
});

test('known failed task can be reset to queued by explicit retry', async (t) => {
  const provider = new StubProvider(async () => ({
    providerId: 'codex',
    outcome: 'failed',
    summary: 'Tests failed',
    failure: {
      kind: 'known',
      code: 'tests-failed',
      message: 'Tests failed',
    },
  }));
  const { runtime } = await fixture(t, provider);

  const result = await runtime.execute({
    projectId: 'project-1',
    taskId: 'task-1',
    providerId: 'codex',
  });
  assert.equal(result.task.task.state, 'failed');

  const retried = await runtime.retry('project-1', 'task-1');
  assert.equal(retried.task.state, 'queued');
});


test('explicit retry enforces bounded attempts and capped exponential backoff', async (t) => {
  let executionCount = 0;
  const provider = new StubProvider(async () => {
    executionCount += 1;
    return {
      providerId: 'codex',
      outcome: 'failed',
      summary: 'Known failure',
      failure: {
        kind: 'known',
        code: 'known-failure',
        message: 'Known failure',
      },
    };
  });
  const { runtime, advanceTime } = await fixture(t, provider, task(), {
    maxExecutionAttempts: 3,
    retryBackoffMs: 100,
    maxRetryBackoffMs: 150,
  });

  await runtime.execute({
    projectId: 'project-1',
    taskId: 'task-1',
    providerId: 'codex',
  });

  await assert.rejects(
    () => runtime.retry('project-1', 'task-1'),
    (error: unknown) =>
      error instanceof AgentWorkflowRuntimeError &&
      error.code === 'AGENT_WORKFLOW_RETRY_NOT_ALLOWED' &&
      /backoff/.test(error.message),
  );

  advanceTime(100);
  await runtime.retry('project-1', 'task-1');
  await runtime.execute({
    projectId: 'project-1',
    taskId: 'task-1',
    providerId: 'codex',
  });

  await assert.rejects(
    () => runtime.retry('project-1', 'task-1'),
    (error: unknown) =>
      error instanceof AgentWorkflowRuntimeError &&
      error.code === 'AGENT_WORKFLOW_RETRY_NOT_ALLOWED' &&
      /backoff/.test(error.message),
  );

  advanceTime(150);
  await runtime.retry('project-1', 'task-1');
  await runtime.execute({
    projectId: 'project-1',
    taskId: 'task-1',
    providerId: 'codex',
  });

  advanceTime(1_000);
  await assert.rejects(
    () => runtime.retry('project-1', 'task-1'),
    (error: unknown) =>
      error instanceof AgentWorkflowRuntimeError &&
      error.code === 'AGENT_WORKFLOW_RETRY_NOT_ALLOWED' &&
      /attempt limit/.test(error.message),
  );
  assert.equal(executionCount, 3);
});

test('invalid retry policy is rejected at runtime construction', async (t) => {
  const provider = new StubProvider(async () => ({
    providerId: 'codex',
    outcome: 'failed',
    summary: 'Known failure',
  }));

  await assert.rejects(
    async () =>
      fixture(t, provider, task(), {
        maxExecutionAttempts: 0,
      }),
    /retry policy is invalid/,
  );
});

test('execution lock prevents two executions of the same task', async (t) => {
  let releaseProvider = (): void => undefined;
  let providerStarted = (): void => undefined;
  const started = new Promise<void>((resolve) => {
    providerStarted = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    releaseProvider = resolve;
  });

  const provider = new StubProvider(async () => {
    providerStarted();
    await gate;
    return {
      providerId: 'codex',
      outcome: 'succeeded',
      summary: 'Done',
    };
  });
  const { runtime } = await fixture(t, provider);

  const first = runtime.execute({
    projectId: 'project-1',
    taskId: 'task-1',
    providerId: 'codex',
  });
  await started;

  await assert.rejects(
    () =>
      runtime.execute({
        projectId: 'project-1',
        taskId: 'task-1',
        providerId: 'codex',
      }),
    (error: unknown) =>
      error instanceof AgentTaskLockError && error.code === 'AGENT_TASK_LOCKED',
  );

  releaseProvider();
  await first;
});

test('cancellation requires exact execution ownership and aborts only the active provider', async (t) => {
  let providerStarted = (): void => undefined;
  const started = new Promise<void>((resolve) => {
    providerStarted = resolve;
  });

  const provider = new StubProvider(
    (request) =>
      new Promise<AgentProviderResult>((resolve) => {
        providerStarted();
        request.signal?.addEventListener(
          'abort',
          () =>
            resolve({
              providerId: 'codex',
              outcome: 'cancelled',
              summary: 'Cancelled',
              failure: {
                kind: 'known',
                code: 'cancelled',
                message: 'Cancelled',
              },
            }),
          { once: true },
        );
      }),
  );
  const { runtime } = await fixture(t, provider);

  const execution = runtime.execute({
    projectId: 'project-1',
    taskId: 'task-1',
    providerId: 'codex',
  });
  await started;

  assert.throws(
    () =>
      runtime.cancel({
        ownership: {
          projectId: 'project-1',
          taskId: 'task-1',
          executionId: 'wrong-execution',
          environmentInstanceId: 'env-1',
        },
        requestedAt: '2026-09-22T15:01:00.000Z',
      }),
    (error: unknown) =>
      error instanceof AgentWorkflowRuntimeError &&
      error.code === 'AGENT_WORKFLOW_CANCEL_OWNERSHIP_MISMATCH',
  );

  runtime.cancel({
    ownership: {
      projectId: 'project-1',
      taskId: 'task-1',
      executionId: 'execution-1',
      environmentInstanceId: 'env-1',
    },
    requestedAt: '2026-09-22T15:01:00.000Z',
  });

  const result = await execution;
  assert.equal(result.execution.state, 'cancelled');
  assert.equal(result.task.task.state, 'cancelled');
});

test('authorization from another task is rejected before provider dispatch', async (t) => {
  const provider = new StubProvider(async () => ({
    providerId: 'codex',
    outcome: 'succeeded',
    summary: 'Done',
  }));
  const { runtime } = await fixture(t, provider);

  await assert.rejects(
    () =>
      runtime.execute({
        projectId: 'project-1',
        taskId: 'task-1',
        providerId: 'codex',
        authorizations: [
          {
            taskId: 'task-2',
            capability: 'workspace:write',
            granted: true,
            observedAt: '2026-09-22T15:00:00.000Z',
          },
        ],
      }),
    (error: unknown) =>
      error instanceof AgentWorkflowRuntimeError &&
      error.code === 'AGENT_WORKFLOW_AUTHORIZATION_INVALID',
  );

  assert.equal(provider.lastRequest, undefined);
});

test('project ownership mismatch is rejected without dispatching the provider', async (t) => {
  const provider = new StubProvider(async () => ({
    providerId: 'codex',
    outcome: 'succeeded',
    summary: 'Done',
  }));
  const { runtime } = await fixture(t, provider);

  await assert.rejects(
    () =>
      runtime.execute({
        projectId: 'another-project',
        taskId: 'task-1',
        providerId: 'codex',
      }),
    (error: unknown) =>
      error instanceof AgentWorkflowRuntimeError &&
      error.code === 'AGENT_WORKFLOW_TASK_PROJECT_MISMATCH',
  );

  assert.equal(provider.lastRequest, undefined);
});
