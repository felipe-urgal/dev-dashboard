import assert from 'node:assert/strict';
import test from 'node:test';

import type {
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

test('AgentRuntimeApiService deriva Environment Instance no backend ao criar task', async () => {
  const taskStore = new MemoryTaskStore();
  const service = new AgentRuntimeApiService({
    taskStore,
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
