import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  AgentCapability,
  AgentProviderRegistry,
  AgentTask,
  AgentTaskRecord,
  AgentTaskStore,
} from '@dev-dashboard/agent-runtime';

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
  let auditWrite: unknown;
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
  });

  const result = await service.execute('project-1', 'task-1', 'codex');
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
  });
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
      find: (taskContextId) =>
        taskContextId === context.id ? context : null,
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
      find: (taskContextId) =>
        taskContextId === context.id ? context : null,
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
