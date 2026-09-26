import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  AgentCapability,
  AgentProviderRegistry,
  AgentTask,
  AgentTaskRecord,
  AgentTaskStore,
  AgentUsageRecord,
} from '@dev-dashboard/agent-runtime';
import type { TaskContext } from '@dev-dashboard/contracts';

import {
  AgentRuntimeApiService,
  AgentRuntimeApiServiceError,
} from '../src/services/agent-runtime-api-service.js';

class MemoryTaskStore implements AgentTaskStore {
  private record: AgentTaskRecord | null = null;

  async get(taskId: string): Promise<AgentTaskRecord | null> {
    return this.record?.task.id === taskId ? this.record : null;
  }

  async list(projectId: string): Promise<AgentTaskRecord[]> {
    return this.record?.task.projectId === projectId ? [this.record] : [];
  }

  async save(
    task: AgentTask,
    expectedVersion: number | null,
  ): Promise<AgentTaskRecord> {
    const nextVersion = expectedVersion === null ? 1 : expectedVersion + 1;
    this.record = { task, version: nextVersion };
    return this.record;
  }
}

const registry: AgentProviderRegistry = {
  get: () => null,
  list: () => [],
};

function auditStore() {
  return {
    snapshot: async () => ({
      authorizations: [],
      checkpoints: [],
      events: [],
      evidence: [],
    }),
    listAuthorizations: async () => [],
    setAuthorization: async (
      taskId: string,
      capability: AgentCapability,
      granted: boolean,
      observedAt: string,
    ) => ({ taskId, capability, granted, observedAt }),
    appendExecutionResult: async () => undefined,
    appendEvidence: async () => undefined,
  };
}

test('AgentRuntimeApiService deriva Environment Instance no backend ao criar task', async () => {
  const taskStore = new MemoryTaskStore();
  const service = new AgentRuntimeApiService({
    taskStore,
    auditStore: auditStore(),
    providerRegistry: registry,
    workflowRuntime: {
      status: async () => {
        throw new Error('unused');
      },
      execute: async () => {
        throw new Error('unused');
      },
      cancel: () => undefined,
      retry: async () => {
        throw new Error('unused');
      },
      recover: async () => {
        throw new Error('unused');
      },
      resolveCheckpoint: async () => {
        throw new Error('unused');
      },
      shutdown: async () => undefined,
    },
    projectStore: {
      findProject: (projectId) =>
        projectId === 'project-1' ? ({ id: projectId } as never) : null,
    },
    developmentEnvironmentInstanceStore: {
      resolveForProject: (projectId, environmentInstanceId) =>
        projectId === 'project-1' &&
        (!environmentInstanceId ||
          environmentInstanceId === 'environment:primary:project-1')
          ? {
              projectId,
              environmentInstanceId: 'environment:primary:project-1',
              cwd: '/workspace/project-1',
              runtime: 'host',
            }
          : null,
    },
    now: () => '2026-09-23T10:00:00.000Z',
    createTaskId: () => 'task-1',
  });

  const record = await service.createTask('project-1', {
    summary: '  Implementar boundary HTTP  ',
    requestedCapabilities: ['workspace:write', 'workspace:write'],
  });

  assert.deepEqual(record, {
    version: 1,
    task: {
      id: 'task-1',
      projectId: 'project-1',
      environmentInstanceId: 'environment:primary:project-1',
      state: 'queued',
      summary: 'Implementar boundary HTTP',
      requestedCapabilities: ['workspace:write'],
      createdAt: '2026-09-23T10:00:00.000Z',
      updatedAt: '2026-09-23T10:00:00.000Z',
    },
  });
});

test('AgentRuntimeApiService valida preferência de provider por projeto', async () => {
  const writes: unknown[] = [];
  const service = new AgentRuntimeApiService({
    taskStore: new MemoryTaskStore(),
    auditStore: auditStore(),
    providerRegistry: registry,
    providerPreferenceStore: {
      get: async () => null,
      set: async (preference) => {
        writes.push(preference);
        return preference;
      },
      clear: async () => undefined,
    },
    workflowRuntime: {
      status: async () => {
        throw new Error('unused');
      },
      execute: async () => {
        throw new Error('unused');
      },
      cancel: () => undefined,
      retry: async () => {
        throw new Error('unused');
      },
      recover: async () => {
        throw new Error('unused');
      },
      resolveCheckpoint: async () => {
        throw new Error('unused');
      },
      shutdown: async () => undefined,
    },
    projectStore: {
      findProject: (projectId) =>
        projectId === 'project-1' ? ({ id: projectId } as never) : null,
    },
    developmentEnvironmentInstanceStore: {
      resolveForProject: () => null,
    },
    now: () => '2026-09-24T13:40:00.000Z',
  });

  const saved = await service.setProviderPreference('project-1', {
    preferredProviderId: 'claude-code',
    fallbackOrder: ['codex'],
  });
  assert.deepEqual(saved, {
    projectId: 'project-1',
    preferredProviderId: 'claude-code',
    fallbackOrder: ['codex'],
    updatedAt: '2026-09-24T13:40:00.000Z',
  });
  assert.deepEqual(writes, [saved]);

  const defaulted = await service.setProviderPreference('project-1', {
    preferredProviderId: 'codex',
  });
  assert.deepEqual(defaulted.fallbackOrder, ['claude-code']);

  await assert.rejects(
    service.setProviderPreference('project-1', {
      preferredProviderId: 'codex',
      fallbackOrder: ['codex'],
    }),
    (error: unknown) =>
      error instanceof AgentRuntimeApiServiceError &&
      error.code === 'AGENT_API_INVALID_REQUEST',
  );
  assert.equal(writes.length, 2);
});

test('AgentRuntimeApiService conclui task e prepara cleanup pelo worktree owned do Task Context', async () => {
  const taskStore = new MemoryTaskStore();
  await taskStore.save(
    {
      id: 'task-1',
      projectId: 'project-1',
      environmentInstanceId:
        'environment:worktree:project-1:worktree-owned',
      taskContextId: 'context-1',
      state: 'review',
      summary: 'Concluir atividade',
      requestedCapabilities: [],
      createdAt: '2026-09-26T18:15:00.000Z',
      updatedAt: '2026-09-26T18:15:00.000Z',
    },
    null,
  );

  const context: TaskContext = {
    id: 'context-1',
    projectId: 'project-1',
    branch: 'feature/899-agent-completion-cleanup',
    environmentInstanceId:
      'environment:worktree:project-1:worktree-owned',
    worktreeId: 'worktree-owned',
    issue: {
      repository: 'felipe-urgal/dev-dashboard',
      number: 899,
    },
    pullRequest: {
      repository: 'felipe-urgal/dev-dashboard',
      number: 987,
    },
    createdAt: '2026-09-26T18:15:00.000Z',
    updatedAt: '2026-09-26T18:15:00.000Z',
  };
  const evidenceWrites: unknown[] = [];
  const prepareCalls: unknown[] = [];

  const service = new AgentRuntimeApiService({
    taskStore,
    auditStore: {
      ...auditStore(),
      appendEvidence: async (...args) => {
        evidenceWrites.push(args);
      },
    },
    providerRegistry: registry,
    workflowRuntime: {
      status: async () => {
        throw new Error('unused');
      },
      execute: async () => {
        throw new Error('unused');
      },
      cancel: () => undefined,
      retry: async () => {
        throw new Error('unused');
      },
      recover: async () => {
        throw new Error('unused');
      },
      complete: async () => {
        const current = (await taskStore.get('task-1'))!;
        return taskStore.save(
          {
            ...current.task,
            state: 'completed',
            updatedAt: '2026-09-26T18:20:00.000Z',
          },
          current.version,
        );
      },
      resolveCheckpoint: async () => {
        throw new Error('unused');
      },
      shutdown: async () => undefined,
    },
    projectStore: {
      findProject: (projectId) =>
        projectId === 'project-1'
          ? ({
              id: projectId,
              path: '/workspace/project-1',
            } as never)
          : null,
    },
    worktreeLifecycle: {
      prepareRemoval: async (...args) => {
        prepareCalls.push(args);
        return {
          state: 'ready',
          worktreeId: 'worktree-owned',
          environmentInstanceId:
            'environment:worktree:project-1:worktree-owned',
          path: '/workspace/project-1-agent-899',
          branch: 'feature/899-agent-completion-cleanup',
          confirmationToken: 'cleanup-token',
          expiresAt: '2026-09-26T18:21:00.000Z',
        };
      },
      remove: async () => {
        throw new Error('unused');
      },
    },
    developmentEnvironmentInstanceStore: {
      resolveForProject: () => ({
        projectId: 'project-1',
        environmentInstanceId:
          'environment:worktree:project-1:worktree-owned',
        cwd: '/workspace/project-1-agent-899',
        runtime: 'host',
      }),
    },
    taskContextRepository: {
      find: (id) => (id === context.id ? context : null),
      list: () => [context],
    },
    now: () => '2026-09-26T18:20:00.000Z',
  });

  const result = await service.completeTask('project-1', 'task-1', true);

  assert.equal(result.task.task.state, 'completed');
  assert.equal(result.cleanup.status, 'eligible');
  assert.equal(result.cleanup.confirmationToken, 'cleanup-token');
  assert.equal(prepareCalls.length, 1);
  assert.equal((prepareCalls[0] as unknown[])[1], 'worktree-owned');
  assert.equal(evidenceWrites.length, 1);
  assert.equal(result.handoffEvidence.executionId, undefined);
});

test('AgentRuntimeApiService preserva contexto quando cleanup bloqueia e reconcilia após remoção', async () => {
  const taskStore = new MemoryTaskStore();
  await taskStore.save(
    {
      id: 'task-1',
      projectId: 'project-1',
      environmentInstanceId:
        'environment:worktree:project-1:worktree-owned',
      taskContextId: 'context-1',
      state: 'completed',
      summary: 'Atividade concluída',
      requestedCapabilities: [],
      createdAt: '2026-09-26T18:15:00.000Z',
      updatedAt: '2026-09-26T18:20:00.000Z',
    },
    null,
  );

  let context: TaskContext = {
    id: 'context-1',
    projectId: 'project-1',
    branch: 'feature/899-agent-completion-cleanup',
    environmentInstanceId:
      'environment:worktree:project-1:worktree-owned',
    worktreeId: 'worktree-owned',
    createdAt: '2026-09-26T18:15:00.000Z',
    updatedAt: '2026-09-26T18:15:00.000Z',
  };
  let removalState: 'blocked' | 'removed' = 'blocked';

  const service = new AgentRuntimeApiService({
    taskStore,
    auditStore: auditStore(),
    providerRegistry: registry,
    workflowRuntime: {
      status: async () => {
        throw new Error('unused');
      },
      execute: async () => {
        throw new Error('unused');
      },
      cancel: () => undefined,
      retry: async () => {
        throw new Error('unused');
      },
      recover: async () => {
        throw new Error('unused');
      },
      resolveCheckpoint: async () => {
        throw new Error('unused');
      },
      shutdown: async () => undefined,
    },
    projectStore: {
      findProject: () =>
        ({ id: 'project-1', path: '/workspace/project-1' }) as never,
    },
    worktreeLifecycle: {
      prepareRemoval: async () => {
        throw new Error('unused');
      },
      remove: async () =>
        removalState === 'blocked'
          ? {
              state: 'blocked',
              worktreeId: 'worktree-owned',
              environmentInstanceId:
                'environment:worktree:project-1:worktree-owned',
              diagnostic: 'Active terminal still owns the environment.',
            }
          : {
              state: 'removed',
              worktreeId: 'worktree-owned',
              environmentInstanceId:
                'environment:worktree:project-1:worktree-owned',
            },
    },
    developmentEnvironmentInstanceStore: {
      resolveForProject: () => null,
    },
    taskContextRepository: {
      find: () => context,
      list: () => [context],
      update: async (_id, input) => {
        context = {
          ...context,
          ...(input.environmentInstanceId === null
            ? { environmentInstanceId: undefined }
            : {}),
          ...(input.worktreeId === null ? { worktreeId: undefined } : {}),
          updatedAt: '2026-09-26T18:22:00.000Z',
        };
        return context;
      },
    },
    now: () => '2026-09-26T18:22:00.000Z',
  });

  const blocked = await service.cleanupCompletedTask(
    'project-1',
    'task-1',
    'token-1',
  );
  assert.equal(blocked.status, 'blocked');
  assert.equal(context.worktreeId, 'worktree-owned');

  removalState = 'removed';
  const removed = await service.cleanupCompletedTask(
    'project-1',
    'task-1',
    'token-2',
  );
  assert.equal(removed.status, 'removed');
  assert.equal(context.worktreeId, undefined);
  assert.equal(context.environmentInstanceId, undefined);
});

test('AgentRuntimeApiService adota ref via runtime sem ampliar capabilities', async () => {
  const taskStore = new MemoryTaskStore();
  await taskStore.save(
    {
      id: 'task-1',
      projectId: 'project-1',
      environmentInstanceId: 'environment:primary:project-1',
      state: 'queued',
      summary: 'x',
      requestedCapabilities: ['workspace:write'],
      createdAt: '2026-09-23T10:00:00.000Z',
      updatedAt: '2026-09-23T10:00:00.000Z',
    },
    null,
  );

  const calls: unknown[] = [];
  const service = new AgentRuntimeApiService({
    taskStore,
    auditStore: auditStore(),
    providerRegistry: registry,
    workflowRuntime: {
      status: async () => {
        throw new Error('unused');
      },
      execute: async () => {
        throw new Error('unused');
      },
      cancel: () => undefined,
      retry: async () => {
        throw new Error('unused');
      },
      recover: async () => {
        throw new Error('unused');
      },
      adoptGitRef: async (...args) => {
        calls.push(args);
        const current = (await taskStore.get('task-1'))!;
        return taskStore.save(
          {
            ...current.task,
            adoptedGitRef: {
              branch: 'feature/existing',
              commitHash: 'a'.repeat(40),
              verifiedAt: '2026-09-23T10:01:00.000Z',
            },
            updatedAt: '2026-09-23T10:01:00.000Z',
          },
          current.version,
        );
      },
      resolveCheckpoint: async () => {
        throw new Error('unused');
      },
      shutdown: async () => undefined,
    },
    projectStore: {
      findProject: () => ({ id: 'project-1' }) as never,
    },
    developmentEnvironmentInstanceStore: {
      resolveForProject: () => null,
    },
    now: () => '2026-09-23T10:01:00.000Z',
  });

  const record = await service.adoptGitRef('project-1', 'task-1', {
    branch: 'feature/existing',
    commitHash: 'A'.repeat(40),
    confirmed: true,
  });

  assert.deepEqual(calls, [
    [
      'project-1',
      'task-1',
      {
        branch: 'feature/existing',
        commitHash: 'A'.repeat(40),
        confirmed: true,
      },
    ],
  ]);
  assert.deepEqual(record.task.requestedCapabilities, ['workspace:write']);
  assert.equal(record.task.adoptedGitRef?.commitHash, 'a'.repeat(40));
});

test('AgentRuntimeApiService cancela somente ownership ativo resolvido no backend', async () => {
  const taskStore = new MemoryTaskStore();
  await taskStore.save(
    {
      id: 'task-1',
      projectId: 'project-1',
      environmentInstanceId: 'environment:primary:project-1',
      state: 'running',
      summary: 'x',
      requestedCapabilities: [],
      createdAt: '2026-09-23T10:00:00.000Z',
      updatedAt: '2026-09-23T10:00:00.000Z',
    },
    null,
  );

  let cancelled: unknown;
  const activeExecution = {
    projectId: 'project-1',
    taskId: 'task-1',
    executionId: 'execution-1',
    environmentInstanceId: 'environment:primary:project-1',
  };

  const service = new AgentRuntimeApiService({
    taskStore,
    auditStore: auditStore(),
    providerRegistry: registry,
    workflowRuntime: {
      status: async () => ({
        task: (await taskStore.get('task-1'))!,
        runtime: {
          taskId: 'task-1',
          projectId: 'project-1',
          canonicalVersion: 1,
          state: 'running',
          executionId: 'execution-1',
          attempts: 1,
          updatedAt: '2026-09-23T10:00:00.000Z',
        },
        activeExecution,
      }),
      execute: async () => {
        throw new Error('unused');
      },
      cancel: (request) => {
        cancelled = request;
      },
      retry: async () => {
        throw new Error('unused');
      },
      recover: async () => {
        throw new Error('unused');
      },
      resolveCheckpoint: async () => {
        throw new Error('unused');
      },
      shutdown: async () => undefined,
    },
    projectStore: {
      findProject: () => ({ id: 'project-1' }) as never,
    },
    developmentEnvironmentInstanceStore: {
      resolveForProject: () => null,
    },
    now: () => '2026-09-23T10:05:00.000Z',
  });

  await service.cancel('project-1', 'task-1');
  assert.deepEqual(cancelled, {
    ownership: activeExecution,
    requestedAt: '2026-09-23T10:05:00.000Z',
  });
});

test('AgentRuntimeApiService falha fechado para projeto/ambiente ausente', async () => {
  const service = new AgentRuntimeApiService({
    taskStore: new MemoryTaskStore(),
    auditStore: auditStore(),
    providerRegistry: registry,
    workflowRuntime: {
      status: async () => {
        throw new Error('unused');
      },
      execute: async () => {
        throw new Error('unused');
      },
      cancel: () => undefined,
      retry: async () => {
        throw new Error('unused');
      },
      recover: async () => {
        throw new Error('unused');
      },
      resolveCheckpoint: async () => {
        throw new Error('unused');
      },
      shutdown: async () => undefined,
    },
    projectStore: {
      findProject: (projectId) =>
        projectId === 'project-1' ? ({ id: projectId } as never) : null,
    },
    developmentEnvironmentInstanceStore: {
      resolveForProject: () => null,
    },
  });

  await assert.rejects(
    service.createTask('missing', { summary: 'x' }),
    (error: unknown) =>
      error instanceof AgentRuntimeApiServiceError &&
      error.code === 'AGENT_API_PROJECT_NOT_FOUND',
  );

  await assert.rejects(
    service.createTask('project-1', { summary: 'x' }),
    (error: unknown) =>
      error instanceof AgentRuntimeApiServiceError &&
      error.code === 'AGENT_API_ENVIRONMENT_NOT_FOUND',
  );
});

test('AgentRuntimeApiService executa somente capabilities autorizadas e persiste evidence', async () => {
  const taskStore = new MemoryTaskStore();
  await taskStore.save(
    {
      id: 'task-1',
      projectId: 'project-1',
      environmentInstanceId: 'environment:primary:project-1',
      state: 'queued',
      summary: 'Executar task',
      requestedCapabilities: ['workspace:write', 'git:commit'],
      createdAt: '2026-09-23T11:00:00.000Z',
      updatedAt: '2026-09-23T11:00:00.000Z',
    },
    null,
  );

  let executeRequest: unknown;
  let conversationRequest: unknown;
  let auditWrite: unknown;
  const activityWrites: unknown[] = [];
  const usageWrites: AgentUsageRecord[] = [];
  const service = new AgentRuntimeApiService({
    taskStore,
    auditStore: {
      ...auditStore(),
      listAuthorizations: async () => [
        {
          taskId: 'task-1',
          capability: 'workspace:write' as const,
          granted: true,
          observedAt: '2026-09-23T11:01:00.000Z',
        },
      ],
      appendExecutionResult: async (...args) => {
        auditWrite = args;
      },
    },
    providerRegistry: registry,
    workflowRuntime: {
      status: async () => {
        throw new Error('unused');
      },
      conversation: async (...args) => {
        conversationRequest = args;
        return [
          {
            id: 'turn-user-2',
            taskId: 'task-1',
            role: 'user',
            content: 'Continue.',
            createdAt: '2026-09-23T11:01:00.000Z',
          },
        ];
      },
      execute: async (request) => {
        executeRequest = request;
        return {
          execution: {
            id: 'execution-1',
            taskId: 'task-1',
            projectId: 'project-1',
            providerId: 'codex',
            state: 'succeeded',
            finishedAt: '2026-09-23T11:02:00.000Z',
            usage: {
              providerId: 'codex',
              source: 'provider',
              inputTokens: 100,
              outputTokens: 20,
            },
          },
          task: (await taskStore.get('task-1'))!,
          providerResult: {
            providerId: 'codex',
            outcome: 'succeeded',
            summary: 'Concluído.',
            evidence: [
              {
                id: 'evidence-1',
                taskId: 'provider-supplied-task',
                kind: 'test',
                summary: 'Testes passaram.',
                observedAt: '2026-09-23T11:01:30.000Z',
              },
            ],
          },
        };
      },
      cancel: () => undefined,
      retry: async () => {
        throw new Error('unused');
      },
      recover: async () => {
        throw new Error('unused');
      },
      resolveCheckpoint: async () => {
        throw new Error('unused');
      },
      shutdown: async () => undefined,
    },
    projectStore: {
      findProject: () => ({ id: 'project-1' }) as never,
    },
    developmentEnvironmentInstanceStore: {
      resolveForProject: () => null,
    },
    activityEventStore: {
      append: async (input) => {
        activityWrites.push(input);
        return {
          id: `activity-${activityWrites.length}`,
          occurredAt: input.occurredAt ?? '2026-09-23T11:02:00.000Z',
          ...input,
        };
      },
    },
    usageStore: {
      append: async (record) => {
        usageWrites.push(record);
        return record;
      },
    },
  });

  const result = await service.execute('project-1', 'task-1', 'codex', {
    id: 'turn-user-2',
    content: 'Continue.',
  });
  assert.deepEqual(executeRequest, {
    projectId: 'project-1',
    taskId: 'task-1',
    providerId: 'codex',
    authorizations: [
      {
        taskId: 'task-1',
        capability: 'workspace:write',
        granted: true,
        observedAt: '2026-09-23T11:01:00.000Z',
      },
    ],
    userTurn: {
      id: 'turn-user-2',
      content: 'Continue.',
    },
  });
  const conversation = await service.conversation('project-1', 'task-1');
  assert.deepEqual(conversationRequest, ['project-1', 'task-1']);
  assert.equal(conversation[0]?.id, 'turn-user-2');
  assert.equal(result.providerResult.evidence?.[0]?.taskId, 'task-1');
  assert.equal(result.providerResult.evidence?.[0]?.executionId, 'execution-1');
  assert.deepEqual(auditWrite, [
    'task-1',
    'execution-1',
    'codex',
    'Concluído.',
    '2026-09-23T11:02:00.000Z',
    result.providerResult.evidence,
  ]);
  assert.deepEqual(usageWrites, [
    {
      executionId: 'execution-1',
      taskId: 'task-1',
      projectId: 'project-1',
      providerId: 'codex',
      observedAt: '2026-09-23T11:02:00.000Z',
      usage: {
        providerId: 'codex',
        source: 'provider',
        inputTokens: 100,
        outputTokens: 20,
      },
    },
  ]);
  assert.deepEqual(
    activityWrites.map((value) => (value as { type: string }).type),
    [
      'agent.execution.started',
      'agent.provider.selected',
      'agent.execution.succeeded',
    ],
  );
  const serializedActivity = JSON.stringify(activityWrites);
  assert.equal(serializedActivity.includes('Executar task'), false);
  assert.equal(serializedActivity.includes('Concluído.'), false);
  assert.equal(serializedActivity.includes('Testes passaram.'), false);
});

test('AgentRuntimeApiService não transforma falha de usage em falha da execução', async () => {
  const taskStore = new MemoryTaskStore();
  await taskStore.save(
    {
      id: 'task-1',
      projectId: 'project-1',
      state: 'queued',
      summary: 'Executar task',
      requestedCapabilities: [],
      createdAt: '2026-09-23T11:00:00.000Z',
      updatedAt: '2026-09-23T11:00:00.000Z',
    },
    null,
  );

  const service = new AgentRuntimeApiService({
    taskStore,
    auditStore: auditStore(),
    providerRegistry: registry,
    workflowRuntime: {
      status: async () => {
        throw new Error('unused');
      },
      execute: async () => ({
        execution: {
          id: 'execution-1',
          taskId: 'task-1',
          projectId: 'project-1',
          providerId: 'claude-code',
          state: 'succeeded',
          finishedAt: '2026-09-23T11:02:00.000Z',
          usage: {
            providerId: 'claude-code',
            source: 'provider',
            reportedCost: { amount: 0.02, currency: 'USD' },
          },
        },
        task: (await taskStore.get('task-1'))!,
        providerResult: {
          providerId: 'claude-code',
          outcome: 'succeeded',
          summary: 'Concluído.',
        },
      }),
      cancel: () => undefined,
      retry: async () => {
        throw new Error('unused');
      },
      recover: async () => {
        throw new Error('unused');
      },
      resolveCheckpoint: async () => {
        throw new Error('unused');
      },
      shutdown: async () => undefined,
    },
    projectStore: {
      findProject: () => ({ id: 'project-1' }) as never,
    },
    developmentEnvironmentInstanceStore: {
      resolveForProject: () => null,
    },
    usageStore: {
      append: async () => {
        throw new Error('disk unavailable');
      },
    },
  });

  const result = await service.execute('project-1', 'task-1', 'claude-code');
  assert.equal(result.execution.state, 'succeeded');
});

test('AgentRuntimeApiService só autoriza capability solicitada pela task', async () => {
  const taskStore = new MemoryTaskStore();
  await taskStore.save(
    {
      id: 'task-1',
      projectId: 'project-1',
      state: 'queued',
      summary: 'x',
      requestedCapabilities: ['workspace:write'],
      createdAt: '2026-09-23T11:00:00.000Z',
      updatedAt: '2026-09-23T11:00:00.000Z',
    },
    null,
  );

  const writes: unknown[] = [];
  const service = new AgentRuntimeApiService({
    taskStore,
    auditStore: {
      ...auditStore(),
      setAuthorization: async (...args) => {
        writes.push(args);
        return {
          taskId: args[0],
          capability: args[1],
          granted: args[2],
          observedAt: args[3],
        };
      },
    },
    providerRegistry: registry,
    workflowRuntime: {
      status: async () => {
        throw new Error('unused');
      },
      execute: async () => {
        throw new Error('unused');
      },
      cancel: () => undefined,
      retry: async () => {
        throw new Error('unused');
      },
      recover: async () => {
        throw new Error('unused');
      },
      resolveCheckpoint: async () => {
        throw new Error('unused');
      },
      shutdown: async () => undefined,
    },
    projectStore: {
      findProject: () => ({ id: 'project-1' }) as never,
    },
    developmentEnvironmentInstanceStore: {
      resolveForProject: () => null,
    },
    now: () => '2026-09-23T11:05:00.000Z',
  });

  await service.setAuthorization(
    'project-1',
    'task-1',
    'workspace:write',
    true,
  );
  assert.deepEqual(writes, [
    ['task-1', 'workspace:write', true, '2026-09-23T11:05:00.000Z'],
  ]);

  await assert.rejects(
    service.setAuthorization('project-1', 'task-1', 'git:push', true),
    (error: unknown) =>
      error instanceof AgentRuntimeApiServiceError &&
      error.code === 'AGENT_API_INVALID_REQUEST',
  );
  assert.equal(writes.length, 1);
});

test('AgentRuntimeApiService resolve checkpoint somente via workflow backend-owned', async () => {
  const taskStore = new MemoryTaskStore();
  await taskStore.save(
    {
      id: 'task-1',
      projectId: 'project-1',
      state: 'checkpoint',
      summary: 'x',
      requestedCapabilities: ['workspace:write'],
      createdAt: '2026-09-23T12:00:00.000Z',
      updatedAt: '2026-09-23T12:00:00.000Z',
    },
    null,
  );

  const calls: unknown[] = [];
  const service = new AgentRuntimeApiService({
    taskStore,
    auditStore: auditStore(),
    providerRegistry: registry,
    workflowRuntime: {
      status: async () => {
        throw new Error('unused');
      },
      execute: async () => {
        throw new Error('unused');
      },
      cancel: () => undefined,
      retry: async () => {
        throw new Error('unused');
      },
      recover: async () => {
        throw new Error('unused');
      },
      resolveCheckpoint: async (...args) => {
        calls.push(args);
        return {
          task: (await taskStore.get('task-1'))!,
          checkpoint: {
            id: 'checkpoint-1',
            taskId: 'task-1',
            status: 'approved',
            summary: 'Approve.',
            requiredCapabilities: [],
            createdAt: '2026-09-23T12:00:00.000Z',
            resolvedAt: '2026-09-23T12:01:00.000Z',
            continuationInstruction: 'Continue safely.',
          },
        };
      },
      shutdown: async () => undefined,
    },
    projectStore: {
      findProject: () => ({ id: 'project-1' }) as never,
    },
    developmentEnvironmentInstanceStore: {
      resolveForProject: () => null,
    },
  });

  const result = await service.resolveCheckpoint(
    'project-1',
    'task-1',
    'checkpoint-1',
    'approved',
    'Continue safely.',
  );

  assert.equal(result.checkpoint.status, 'approved');
  assert.deepEqual(calls, [
    ['project-1', 'task-1', 'checkpoint-1', 'approved', 'Continue safely.'],
  ]);
});

test('AgentRuntimeApiService deriva worktree do Task Context e rejeita associação ambígua', async () => {
  const taskStore = new MemoryTaskStore();
  const context = {
    id: 'context-1',
    projectId: 'project-1',
    branch: 'feature/context',
    environmentInstanceId: 'environment:worktree:project-1:worktree-1',
    worktreeId: 'worktree-1',
    createdAt: '2026-09-23T12:30:00.000Z',
    updatedAt: '2026-09-23T12:30:00.000Z',
  };
  let resolvedEnvironment: string | undefined;

  const service = new AgentRuntimeApiService({
    taskStore,
    auditStore: auditStore(),
    providerRegistry: registry,
    workflowRuntime: {
      status: async () => {
        throw new Error('unused');
      },
      execute: async () => {
        throw new Error('unused');
      },
      cancel: () => undefined,
      retry: async () => {
        throw new Error('unused');
      },
      recover: async () => {
        throw new Error('unused');
      },
      resolveCheckpoint: async () => {
        throw new Error('unused');
      },
      shutdown: async () => undefined,
    },
    projectStore: {
      findProject: (projectId) =>
        projectId === 'project-1' ? ({ id: projectId } as never) : null,
    },
    developmentEnvironmentInstanceStore: {
      resolveForProject: (projectId, environmentInstanceId) => {
        resolvedEnvironment = environmentInstanceId;
        return projectId === 'project-1' &&
          environmentInstanceId === context.environmentInstanceId
          ? {
              projectId,
              environmentInstanceId,
              cwd: '/workspace/worktree-1',
              runtime: 'host',
            }
          : null;
      },
    },
    taskContextRepository: {
      find: (taskContextId) => (taskContextId === context.id ? context : null),
    },
    now: () => '2026-09-23T12:31:00.000Z',
    createTaskId: () => 'task-context-bound',
  });

  const created = await service.createTask('project-1', {
    summary: 'Executar no worktree correto',
    taskContextId: 'context-1',
    requestedCapabilities: ['workspace:write'],
  });

  assert.equal(
    resolvedEnvironment,
    'environment:worktree:project-1:worktree-1',
  );
  assert.equal(created.task.taskContextId, 'context-1');
  assert.equal(
    created.task.environmentInstanceId,
    'environment:worktree:project-1:worktree-1',
  );

  await assert.rejects(
    service.createTask('project-1', {
      summary: 'Contexto conflitante',
      taskContextId: 'context-1',
      environmentInstanceId: 'environment:primary:project-1',
    }),
    (error: unknown) =>
      error instanceof AgentRuntimeApiServiceError &&
      error.code === 'AGENT_API_INVALID_REQUEST',
  );

  await assert.rejects(
    service.createTask('project-1', {
      summary: 'Contexto ausente',
      taskContextId: 'context-missing',
    }),
    (error: unknown) =>
      error instanceof AgentRuntimeApiServiceError &&
      error.code === 'AGENT_API_TASK_CONTEXT_NOT_FOUND',
  );
});

test('AgentRuntimeApiService revalida contexto e anexa PR, HEAD e Readiness como evidence', async () => {
  const taskStore = new MemoryTaskStore();
  const context = {
    id: 'context-1',
    projectId: 'project-1',
    branch: 'feature/context',
    environmentInstanceId: 'environment:worktree:project-1:worktree-1',
    worktreeId: 'worktree-1',
    pullRequest: { repository: 'felipe-urgal/dev-dashboard', number: 900 },
    createdAt: '2026-09-23T12:30:00.000Z',
    updatedAt: '2026-09-23T12:30:00.000Z',
  };
  await taskStore.save(
    {
      id: 'task-1',
      projectId: 'project-1',
      environmentInstanceId: context.environmentInstanceId,
      taskContextId: context.id,
      state: 'queued',
      summary: 'Executar com contexto',
      requestedCapabilities: [],
      createdAt: '2026-09-23T12:30:00.000Z',
      updatedAt: '2026-09-23T12:30:00.000Z',
    },
    null,
  );

  let auditWrite: unknown;
  let nextEvidence = 0;
  const service = new AgentRuntimeApiService({
    taskStore,
    auditStore: {
      ...auditStore(),
      appendExecutionResult: async (...args) => {
        auditWrite = args;
      },
    },
    providerRegistry: registry,
    workflowRuntime: {
      status: async () => {
        throw new Error('unused');
      },
      execute: async () => ({
        execution: {
          id: 'execution-1',
          taskId: 'task-1',
          projectId: 'project-1',
          environmentInstanceId: context.environmentInstanceId,
          providerId: 'codex',
          state: 'succeeded',
          finishedAt: '2026-09-23T12:35:00.000Z',
        },
        task: (await taskStore.get('task-1'))!,
        providerResult: {
          providerId: 'codex',
          outcome: 'succeeded',
          summary: 'Concluído.',
        },
      }),
      cancel: () => undefined,
      retry: async () => {
        throw new Error('unused');
      },
      recover: async () => {
        throw new Error('unused');
      },
      resolveCheckpoint: async () => {
        throw new Error('unused');
      },
      shutdown: async () => undefined,
    },
    projectStore: {
      findProject: () => ({ id: 'project-1' }) as never,
    },
    developmentEnvironmentInstanceStore: {
      resolveForProject: () => null,
    },
    taskContextRepository: {
      find: (taskContextId) => (taskContextId === context.id ? context : null),
    },
    taskContextSnapshotReader: {
      snapshot: async () => ({
        context,
        evidence: {
          observedAt: '2026-09-23T12:34:00.000Z',
          currentBranch: 'feature/context',
          branchMatches: true,
          headSha: 'abc123',
          pullRequestObservedAt: '2026-09-23T12:34:10.000Z',
          pullRequest: {
            provider: 'github',
            number: 900,
            title: 'Agent context',
            url: 'https://github.com/felipe-urgal/dev-dashboard/pull/900',
            sourceBranch: 'feature/context',
            baseBranch: 'main',
            ciStatus: 'success',
          },
          readiness: {
            status: 'warning',
            observedAt: '2026-09-23T12:34:20.000Z',
          },
        },
      }),
    },
    createEvidenceId: () => `context-evidence-${++nextEvidence}`,
  });

  const result = await service.execute('project-1', 'task-1', 'codex');

  assert.deepEqual(
    result.providerResult.evidence?.map((item) => item.kind),
    ['other', 'pull-request', 'readiness'],
  );
  assert.equal(
    result.providerResult.evidence?.find((item) => item.kind === 'readiness')
      ?.summary,
    'Release Readiness: warning.',
  );
  assert.deepEqual(
    (auditWrite as unknown[]).at(-1),
    result.providerResult.evidence,
  );

  const mismatched = new AgentRuntimeApiService({
    taskStore,
    auditStore: auditStore(),
    providerRegistry: registry,
    workflowRuntime: {
      status: async () => {
        throw new Error('unused');
      },
      execute: async () => {
        throw new Error('must not execute');
      },
      cancel: () => undefined,
      retry: async () => {
        throw new Error('unused');
      },
      recover: async () => {
        throw new Error('unused');
      },
      resolveCheckpoint: async () => {
        throw new Error('unused');
      },
      shutdown: async () => undefined,
    },
    projectStore: {
      findProject: () => ({ id: 'project-1' }) as never,
    },
    developmentEnvironmentInstanceStore: {
      resolveForProject: () => null,
    },
    taskContextRepository: {
      find: () => ({
        ...context,
        environmentInstanceId: 'environment:primary:project-1',
      }),
    },
  });

  await assert.rejects(
    mismatched.execute('project-1', 'task-1', 'codex'),
    (error: unknown) =>
      error instanceof AgentRuntimeApiServiceError &&
      error.code === 'AGENT_API_INVALID_REQUEST',
  );
});

test('AgentRuntimeApiService não deixa falha do Activity bloquear task canônica', async () => {
  const service = new AgentRuntimeApiService({
    taskStore: new MemoryTaskStore(),
    auditStore: auditStore(),
    providerRegistry: registry,
    workflowRuntime: {
      status: async () => {
        throw new Error('unused');
      },
      execute: async () => {
        throw new Error('unused');
      },
      cancel: () => undefined,
      retry: async () => {
        throw new Error('unused');
      },
      recover: async () => {
        throw new Error('unused');
      },
      resolveCheckpoint: async () => {
        throw new Error('unused');
      },
      shutdown: async () => undefined,
    },
    projectStore: {
      findProject: () => ({ id: 'project-1' }) as never,
    },
    developmentEnvironmentInstanceStore: {
      resolveForProject: () => ({
        projectId: 'project-1',
        environmentInstanceId: 'environment:primary:project-1',
        cwd: '/workspace/project-1',
        runtime: 'host',
      }),
    },
    activityEventStore: {
      append: async () => {
        throw new Error('activity unavailable');
      },
    },
    now: () => '2026-09-23T13:00:00.000Z',
    createTaskId: () => 'task-activity-isolation',
  });

  const record = await service.createTask('project-1', {
    summary: 'Segredo que não pertence à Activity',
  });

  assert.equal(record.task.id, 'task-activity-isolation');
  assert.equal(record.task.state, 'queued');
});

test('AgentRuntimeApiService avalia soft budget somente com métricas observadas', async () => {
  const taskStore = new MemoryTaskStore();
  await taskStore.save(
    {
      id: 'task-1',
      projectId: 'project-1',
      state: 'queued',
      summary: 'Executar task',
      requestedCapabilities: [],
      createdAt: '2026-09-23T12:00:00.000Z',
      updatedAt: '2026-09-23T12:00:00.000Z',
    },
    null,
  );

  let savedBudget: {
    projectId: string;
    taskId: string;
    maxTotalTokens?: number;
    maxEstimatedCostUsd?: number;
    updatedAt: string;
  } | null = null;

  const service = new AgentRuntimeApiService({
    taskStore,
    auditStore: auditStore(),
    providerRegistry: registry,
    workflowRuntime: {
      status: async () => {
        throw new Error('unused');
      },
      execute: async () => {
        throw new Error('unused');
      },
      cancel: () => undefined,
      retry: async () => {
        throw new Error('unused');
      },
      recover: async () => {
        throw new Error('unused');
      },
      resolveCheckpoint: async () => {
        throw new Error('unused');
      },
      shutdown: async () => undefined,
    },
    projectStore: {
      findProject: () => ({ id: 'project-1' }) as never,
    },
    developmentEnvironmentInstanceStore: {
      resolveForProject: () => null,
    },
    usageStore: {
      append: async (record) => record,
      summary: async () => ({
        executionCount: 2,
        totalTokens: 12_000,
        estimatedCostUsd: 0.4,
      }),
    },
    budgetStore: {
      get: async () => savedBudget,
      set: async (budget) => {
        savedBudget = budget;
        return budget;
      },
      clear: async () => {
        savedBudget = null;
      },
    },
    now: () => '2026-09-23T12:05:00.000Z',
  });

  const result = await service.setBudget('project-1', 'task-1', {
    maxTotalTokens: 10_000,
    maxEstimatedCostUsd: 0.5,
  });

  assert.equal(result.budget?.maxTotalTokens, 10_000);
  assert.deepEqual(result.alerts, [
    {
      kind: 'total-tokens',
      observed: 12_000,
      threshold: 10_000,
    },
  ]);

  savedBudget = {
    projectId: 'project-1',
    taskId: 'task-1',
    maxEstimatedCostUsd: 0.3,
    updatedAt: '2026-09-23T12:05:00.000Z',
  };
  assert.deepEqual((await service.budget('project-1', 'task-1')).alerts, [
    {
      kind: 'estimated-cost-usd',
      observed: 0.4,
      threshold: 0.3,
    },
  ]);
});

test('AgentRuntimeApiService não alerta budget sem métrica observada', async () => {
  const taskStore = new MemoryTaskStore();
  await taskStore.save(
    {
      id: 'task-1',
      projectId: 'project-1',
      state: 'queued',
      summary: 'Executar task',
      requestedCapabilities: [],
      createdAt: '2026-09-23T12:00:00.000Z',
      updatedAt: '2026-09-23T12:00:00.000Z',
    },
    null,
  );

  const service = new AgentRuntimeApiService({
    taskStore,
    auditStore: auditStore(),
    providerRegistry: registry,
    workflowRuntime: {
      status: async () => {
        throw new Error('unused');
      },
      execute: async () => {
        throw new Error('unused');
      },
      cancel: () => undefined,
      retry: async () => {
        throw new Error('unused');
      },
      recover: async () => {
        throw new Error('unused');
      },
      resolveCheckpoint: async () => {
        throw new Error('unused');
      },
      shutdown: async () => undefined,
    },
    projectStore: {
      findProject: () => ({ id: 'project-1' }) as never,
    },
    developmentEnvironmentInstanceStore: {
      resolveForProject: () => null,
    },
    usageStore: {
      append: async (record) => record,
      summary: async () => ({ executionCount: 1, inputTokens: 500 }),
    },
    budgetStore: {
      get: async () => ({
        projectId: 'project-1',
        taskId: 'task-1',
        maxTotalTokens: 100,
        maxEstimatedCostUsd: 0.01,
        updatedAt: '2026-09-23T12:00:00.000Z',
      }),
      set: async (budget) => budget,
      clear: async () => undefined,
    },
  });

  assert.deepEqual((await service.budget('project-1', 'task-1')).alerts, []);
});

test('AgentRuntimeApiService bloqueia nova execução antes do provider ao atingir hard budget', async () => {
  const taskStore = new MemoryTaskStore();
  await taskStore.save(
    {
      id: 'task-1',
      projectId: 'project-1',
      state: 'queued',
      summary: 'Executar task',
      requestedCapabilities: [],
      createdAt: '2026-09-23T13:00:00.000Z',
      updatedAt: '2026-09-23T13:00:00.000Z',
    },
    null,
  );

  let executeCalls = 0;
  const activityWrites: unknown[] = [];
  const service = new AgentRuntimeApiService({
    taskStore,
    auditStore: auditStore(),
    providerRegistry: registry,
    workflowRuntime: {
      status: async () => {
        throw new Error('unused');
      },
      execute: async () => {
        executeCalls += 1;
        throw new Error('provider must not be called');
      },
      cancel: () => undefined,
      retry: async () => {
        throw new Error('unused');
      },
      recover: async () => {
        throw new Error('unused');
      },
      resolveCheckpoint: async () => {
        throw new Error('unused');
      },
      shutdown: async () => undefined,
    },
    projectStore: {
      findProject: () => ({ id: 'project-1' }) as never,
    },
    developmentEnvironmentInstanceStore: {
      resolveForProject: () => null,
    },
    usageStore: {
      append: async (record) => record,
      summary: async () => ({
        executionCount: 2,
        totalTokens: 12_000,
      }),
    },
    budgetStore: {
      get: async () => ({
        projectId: 'project-1',
        taskId: 'task-1',
        maxTotalTokens: 10_000,
        mode: 'hard',
        updatedAt: '2026-09-23T13:00:00.000Z',
      }),
      set: async (budget) => budget,
      clear: async () => undefined,
    },
    activityEventStore: {
      append: async (input) => {
        activityWrites.push(input);
        return {
          id: 'activity-1',
          occurredAt: input.occurredAt ?? '2026-09-23T13:00:00.000Z',
          ...input,
        };
      },
    },
  });

  await assert.rejects(
    service.execute('project-1', 'task-1', 'codex'),
    (error: unknown) =>
      error instanceof AgentRuntimeApiServiceError &&
      error.code === 'AGENT_API_BUDGET_EXCEEDED',
  );

  assert.equal(executeCalls, 0);
  assert.equal(activityWrites.length, 0);
});

test('AgentRuntimeApiService não bloqueia hard budget sem métrica observada', async () => {
  const taskStore = new MemoryTaskStore();
  await taskStore.save(
    {
      id: 'task-1',
      projectId: 'project-1',
      state: 'queued',
      summary: 'Executar task',
      requestedCapabilities: [],
      createdAt: '2026-09-23T13:00:00.000Z',
      updatedAt: '2026-09-23T13:00:00.000Z',
    },
    null,
  );

  const service = new AgentRuntimeApiService({
    taskStore,
    auditStore: auditStore(),
    providerRegistry: registry,
    workflowRuntime: {
      status: async () => {
        throw new Error('unused');
      },
      execute: async () => ({
        execution: {
          id: 'execution-1',
          taskId: 'task-1',
          projectId: 'project-1',
          providerId: 'codex',
          state: 'succeeded',
          finishedAt: '2026-09-23T13:01:00.000Z',
        },
        task: (await taskStore.get('task-1'))!,
        providerResult: {
          providerId: 'codex',
          outcome: 'succeeded',
          summary: 'done',
        },
      }),
      cancel: () => undefined,
      retry: async () => {
        throw new Error('unused');
      },
      recover: async () => {
        throw new Error('unused');
      },
      resolveCheckpoint: async () => {
        throw new Error('unused');
      },
      shutdown: async () => undefined,
    },
    projectStore: {
      findProject: () => ({ id: 'project-1' }) as never,
    },
    developmentEnvironmentInstanceStore: {
      resolveForProject: () => null,
    },
    usageStore: {
      append: async (record) => record,
      summary: async () => ({
        executionCount: 1,
        inputTokens: 500,
      }),
    },
    budgetStore: {
      get: async () => ({
        projectId: 'project-1',
        taskId: 'task-1',
        maxTotalTokens: 100,
        mode: 'hard',
        updatedAt: '2026-09-23T13:00:00.000Z',
      }),
      set: async (budget) => budget,
      clear: async () => undefined,
    },
  });

  const result = await service.execute('project-1', 'task-1', 'codex');
  assert.equal(result.execution.state, 'succeeded');
});

test('AgentRuntimeApiService adota issue em Task Context e reutiliza vínculo persistido', async () => {
  const taskStore = new MemoryTaskStore();
  const contexts: TaskContext[] = [];
  let contextCreations = 0;
  const service = new AgentRuntimeApiService({
    taskStore,
    auditStore: auditStore(),
    providerRegistry: registry,
    workflowRuntime: {
      status: async () => {
        throw new Error('unused');
      },
      execute: async () => {
        throw new Error('unused');
      },
      cancel: () => undefined,
      retry: async () => {
        throw new Error('unused');
      },
      recover: async () => {
        throw new Error('unused');
      },
      resolveCheckpoint: async () => {
        throw new Error('unused');
      },
      shutdown: async () => undefined,
    },
    projectStore: {
      findProject: (projectId) =>
        projectId === 'project-1'
          ? ({ id: projectId, path: '/workspace/project-1' } as never)
          : null,
    },
    developmentEnvironmentInstanceStore: {
      resolveForProject: (projectId, environmentInstanceId) =>
        projectId === 'project-1' &&
        (!environmentInstanceId ||
          environmentInstanceId === 'environment:primary:project-1')
          ? {
              projectId,
              environmentInstanceId: 'environment:primary:project-1',
              cwd: '/workspace/project-1',
              runtime: 'host',
            }
          : null,
    },
    taskContextRepository: {
      find: (taskContextId) =>
        contexts.find((context) => context.id === taskContextId) ?? null,
      list: () => contexts,
    },
    taskContextCreator: {
      create: async (projectId, input) => {
        contextCreations += 1;
        const context: TaskContext = {
          id: 'context-893',
          projectId,
          branch: 'main',
          environmentInstanceId:
            input.environmentInstanceId ?? 'environment:primary:project-1',
          ...(input.issue ? { issue: input.issue } : {}),
          createdAt: '2026-09-25T12:40:00.000Z',
          updatedAt: '2026-09-25T12:40:00.000Z',
        };
        contexts.push(context);
        return context;
      },
    },
    backlogReader: {
      select: async () => ({
        status: 'selected',
        source: 'specific-issue',
        issue: {
          repository: 'felipe-urgal/dev-dashboard',
          number: 893,
          title: 'Adotar backlog pelo composer',
          labels: [],
        },
        candidates: [],
      }),
    },
    now: () => '2026-09-25T12:40:00.000Z',
    createTaskId: () => 'task-893',
  });

  const first = await service.adoptBacklog('project-1', {
    issueNumber: 893,
    environmentInstanceId: 'environment:primary:project-1',
    requestedCapabilities: ['workspace:write'],
  });
  assert.equal(first.status, 'adopted');
  if (first.status !== 'adopted') return;
  assert.equal(first.reused, false);
  assert.equal(first.task.task.taskContextId, 'context-893');
  assert.equal(first.task.task.summary, '#893 — Adotar backlog pelo composer');
  assert.deepEqual(first.task.task.requestedCapabilities, ['workspace:write']);

  const second = await service.adoptBacklog('project-1', {
    issueNumber: 893,
    environmentInstanceId: 'environment:primary:project-1',
    requestedCapabilities: ['git:push'],
  });
  assert.equal(second.status, 'adopted');
  if (second.status !== 'adopted') return;
  assert.equal(second.reused, true);
  assert.equal(second.task.task.id, 'task-893');
  assert.deepEqual(second.task.task.requestedCapabilities, ['workspace:write']);
  assert.equal(contextCreations, 1);
});

test('AgentRuntimeApiService provisiona workspace isolado antes de criar Task Context da issue', async () => {
  const taskStore = new MemoryTaskStore();
  const contexts: TaskContext[] = [];
  const provisionCalls: unknown[] = [];
  const isolatedEnvironmentId =
    'environment:worktree:project-1:worktree-0123456789abcdefabcd';

  const service = new AgentRuntimeApiService({
    taskStore,
    auditStore: auditStore(),
    providerRegistry: registry,
    workflowRuntime: {
      status: async () => {
        throw new Error('unused');
      },
      execute: async () => {
        throw new Error('unused');
      },
      cancel: () => undefined,
      retry: async () => {
        throw new Error('unused');
      },
      recover: async () => {
        throw new Error('unused');
      },
      resolveCheckpoint: async () => {
        throw new Error('unused');
      },
      shutdown: async () => undefined,
    },
    projectStore: {
      findProject: (projectId) =>
        projectId === 'project-1'
          ? ({ id: projectId, path: '/workspace/project-1' } as never)
          : null,
    },
    developmentEnvironmentInstanceStore: {
      resolveForProject: (projectId, environmentInstanceId) =>
        projectId === 'project-1' &&
        environmentInstanceId === isolatedEnvironmentId
          ? {
              projectId,
              environmentInstanceId: isolatedEnvironmentId,
              cwd: '/workspace/project-1-agent-897',
              runtime: 'host',
            }
          : null,
    },
    taskContextRepository: {
      find: (taskContextId) =>
        contexts.find((context) => context.id === taskContextId) ?? null,
      list: () => contexts,
    },
    taskContextCreator: {
      create: async (projectId, input) => {
        assert.equal(input.environmentInstanceId, isolatedEnvironmentId);
        const context: TaskContext = {
          id: 'context-897',
          projectId,
          branch: 'feature/897-workspace',
          environmentInstanceId: isolatedEnvironmentId,
          worktreeId: 'worktree-0123456789abcdefabcd',
          ...(input.issue ? { issue: input.issue } : {}),
          createdAt: '2026-09-26T15:00:00.000Z',
          updatedAt: '2026-09-26T15:00:00.000Z',
        };
        contexts.push(context);
        return context;
      },
    },
    backlogReader: {
      select: async () => ({
        status: 'selected',
        source: 'specific-issue',
        issue: {
          repository: 'felipe-urgal/dev-dashboard',
          number: 897,
          title: 'Workspace isolado',
          labels: [],
        },
        candidates: [],
      }),
    },
    workspaceProvisioner: {
      provision: async (...args) => {
        provisionCalls.push(args);
        return {
          state: 'ready',
          branch: 'feature/897-workspace',
          directoryName: 'project-1-agent-897',
          environmentInstanceId: isolatedEnvironmentId,
          worktreeId: 'worktree-0123456789abcdefabcd',
          path: '/workspace/project-1-agent-897',
          reused: false,
        };
      },
    },
    now: () => '2026-09-26T15:00:00.000Z',
    createTaskId: () => 'task-897',
  });

  const first = await service.adoptBacklog('project-1', {
    issueNumber: 897,
    requestedCapabilities: ['workspace:write'],
  });
  assert.equal(first.status, 'adopted');
  if (first.status !== 'adopted') return;
  assert.equal(first.task.task.environmentInstanceId, isolatedEnvironmentId);
  assert.equal(first.task.task.taskContextId, 'context-897');
  assert.equal(provisionCalls.length, 1);

  const second = await service.adoptBacklog('project-1', {
    issueNumber: 897,
  });
  assert.equal(second.status, 'adopted');
  if (second.status !== 'adopted') return;
  assert.equal(second.reused, true);
  assert.equal(provisionCalls.length, 1);
});

test('AgentRuntimeApiService persiste falha de CI como evidence idempotente e passa ao provider', async () => {
  const taskStore = new MemoryTaskStore();
  await taskStore.save(
    {
      id: 'task-1',
      projectId: 'project-1',
      environmentInstanceId: 'environment:worktree:project-1:worktree-1',
      taskContextId: 'context-1',
      state: 'review',
      summary: 'Corrigir PR',
      requestedCapabilities: ['workspace:write', 'git:push'],
      createdAt: '2026-09-26T15:00:00.000Z',
      updatedAt: '2026-09-26T15:00:00.000Z',
    },
    null,
  );

  const context: TaskContext = {
    id: 'context-1',
    projectId: 'project-1',
    branch: 'feature/898-agent-pr-feedback-loop',
    environmentInstanceId: 'environment:worktree:project-1:worktree-1',
    worktreeId: 'worktree-1',
    pullRequest: {
      repository: 'felipe-urgal/dev-dashboard',
      number: 999,
    },
    createdAt: '2026-09-26T15:00:00.000Z',
    updatedAt: '2026-09-26T15:00:00.000Z',
  };
  const persisted: unknown[] = [];
  let executeRequest: unknown;

  const service = new AgentRuntimeApiService({
    taskStore,
    auditStore: {
      ...auditStore(),
      snapshot: async () => ({
        authorizations: [],
        checkpoints: [],
        events: [],
        evidence: [],
      }),
      appendEvidence: async (_taskId, evidence) => {
        persisted.push(...evidence);
      },
    },
    providerRegistry: registry,
    workflowRuntime: {
      status: async () => {
        throw new Error('unused');
      },
      execute: async (request) => {
        executeRequest = request;
        return {
          execution: {
            id: 'execution-1',
            taskId: 'task-1',
            projectId: 'project-1',
            environmentInstanceId: 'environment:worktree:project-1:worktree-1',
            providerId: 'codex',
            state: 'succeeded',
            finishedAt: '2026-09-26T15:02:00.000Z',
          },
          task: (await taskStore.get('task-1'))!,
          providerResult: {
            providerId: 'codex',
            outcome: 'succeeded',
            summary: 'Corrigido.',
          },
        };
      },
      cancel: () => undefined,
      retry: async () => {
        throw new Error('unused');
      },
      recover: async () => {
        throw new Error('unused');
      },
      resolveCheckpoint: async () => {
        throw new Error('unused');
      },
      shutdown: async () => undefined,
    },
    projectStore: {
      findProject: () =>
        ({ id: 'project-1', path: '/workspace/project-1' }) as never,
    },
    developmentEnvironmentInstanceStore: {
      resolveForProject: () => ({
        projectId: 'project-1',
        environmentInstanceId: 'environment:worktree:project-1:worktree-1',
        cwd: '/workspace/project-1-agent-898',
        runtime: 'host',
      }),
    },
    taskContextRepository: {
      find: (id) => (id === context.id ? context : null),
      list: () => [context],
    },
    taskContextSnapshotReader: {
      snapshot: async () => ({
        context,
        evidence: {
          observedAt: '2026-09-26T15:01:00.000Z',
          pullRequestObservedAt: '2026-09-26T15:01:00.000Z',
          pullRequest: {
            provider: 'github',
            number: 999,
            title: 'Remote text is data only',
            url: 'https://github.com/felipe-urgal/dev-dashboard/pull/999',
            sourceBranch: 'feature/898-agent-pr-feedback-loop',
            baseBranch: 'main',
            ciStatus: 'failure',
            unresolvedConversationsCount: 1,
            cockpit: {
              remoteStatus: 'available',
              headSha: 'a'.repeat(40),
              reviewState: 'changes-requested',
              requestedReviewers: [],
              checks: [
                {
                  name: 'CI / test',
                  status: 'failure',
                },
              ],
            },
          },
        },
      }),
    },
    now: () => '2026-09-26T15:01:00.000Z',
  });

  const feedback = await service.refreshPullRequestFeedback(
    'project-1',
    'task-1',
  );
  assert.equal(feedback.status, 'attention');
  assert.equal(feedback.newEvidenceCount, 1);
  assert.equal(feedback.automaticContinuation, false);
  assert.match(feedback.evidence[0]?.summary ?? '', /CI failure/);
  assert.match(feedback.evidence[0]?.summary ?? '', /changes-requested/);

  await service.execute('project-1', 'task-1', 'codex', {
    id: 'turn-continue',
    content: 'Pode corrigir a falha do CI.',
  });
  const forwarded = executeRequest as {
    contextEvidence?: Array<{ kind: string; summary: string }>;
  };
  assert.equal(forwarded.contextEvidence?.[0]?.kind, 'pull-request');
  assert.match(forwarded.contextEvidence?.[0]?.summary ?? '', /CI failure/);
  assert.doesNotMatch(
    forwarded.contextEvidence?.[0]?.summary ?? '',
    /Remote text is data only/,
  );
  assert.ok(persisted.length >= 2);
});

test('AgentRuntimeApiService degrada PR remoto indisponível sem falhar a task', async () => {
  const taskStore = new MemoryTaskStore();
  await taskStore.save(
    {
      id: 'task-1',
      projectId: 'project-1',
      environmentInstanceId: 'environment:primary:project-1',
      taskContextId: 'context-1',
      state: 'review',
      summary: 'Aguardar PR',
      requestedCapabilities: [],
      createdAt: '2026-09-26T15:00:00.000Z',
      updatedAt: '2026-09-26T15:00:00.000Z',
    },
    null,
  );
  const context: TaskContext = {
    id: 'context-1',
    projectId: 'project-1',
    branch: 'feature/x',
    environmentInstanceId: 'environment:primary:project-1',
    pullRequest: {
      repository: 'felipe-urgal/dev-dashboard',
      number: 10,
    },
    createdAt: '2026-09-26T15:00:00.000Z',
    updatedAt: '2026-09-26T15:00:00.000Z',
  };

  const service = new AgentRuntimeApiService({
    taskStore,
    auditStore: auditStore(),
    providerRegistry: registry,
    workflowRuntime: {
      status: async () => {
        throw new Error('unused');
      },
      execute: async () => {
        throw new Error('unused');
      },
      cancel: () => undefined,
      retry: async () => {
        throw new Error('unused');
      },
      recover: async () => {
        throw new Error('unused');
      },
      resolveCheckpoint: async () => {
        throw new Error('unused');
      },
      shutdown: async () => undefined,
    },
    projectStore: {
      findProject: () => ({ id: 'project-1' }) as never,
    },
    developmentEnvironmentInstanceStore: {
      resolveForProject: () => null,
    },
    taskContextRepository: {
      find: () => context,
      list: () => [context],
    },
    taskContextSnapshotReader: {
      snapshot: async () => {
        throw new Error('github unavailable');
      },
    },
    now: () => '2026-09-26T15:05:00.000Z',
  });

  const feedback = await service.refreshPullRequestFeedback(
    'project-1',
    'task-1',
  );
  assert.equal(feedback.status, 'unavailable');
  assert.match(feedback.evidence[0]?.summary ?? '', /could not be refreshed/);
});

test('AgentRuntimeApiService não cria contexto quando o backlog é ambíguo', async () => {
  let contextCreations = 0;
  const service = new AgentRuntimeApiService({
    taskStore: new MemoryTaskStore(),
    auditStore: auditStore(),
    providerRegistry: registry,
    workflowRuntime: {
      status: async () => {
        throw new Error('unused');
      },
      execute: async () => {
        throw new Error('unused');
      },
      cancel: () => undefined,
      retry: async () => {
        throw new Error('unused');
      },
      recover: async () => {
        throw new Error('unused');
      },
      resolveCheckpoint: async () => {
        throw new Error('unused');
      },
      shutdown: async () => undefined,
    },
    projectStore: {
      findProject: () =>
        ({ id: 'project-1', path: '/workspace/project-1' }) as never,
    },
    developmentEnvironmentInstanceStore: {
      resolveForProject: () => null,
    },
    taskContextCreator: {
      create: async () => {
        contextCreations += 1;
        throw new Error('should not create');
      },
    },
    backlogReader: {
      select: async () => ({
        status: 'ambiguous',
        source: 'no-explicit-priority',
        candidates: [
          {
            repository: 'felipe-urgal/dev-dashboard',
            number: 893,
            title: 'A',
            labels: [],
          },
          {
            repository: 'felipe-urgal/dev-dashboard',
            number: 895,
            title: 'B',
            labels: [],
          },
        ],
      }),
    },
  });

  const result = await service.adoptBacklog('project-1', {});
  assert.equal(result.status, 'ambiguous');
  assert.deepEqual(
    result.candidates.map((issue) => issue.number),
    [893, 895],
  );
  assert.equal(contextCreations, 0);
});
