import assert from 'node:assert/strict';
import test from 'node:test';

import Fastify from 'fastify';

import type {
  AgentRuntimeApiServicePort,
  AgentTaskCreateInput,
} from '../src/services/agent-runtime-api-service.js';
import { registerApiErrorHandling } from '../src/http/api-error.js';
import { agentRuntimeRoutes } from '../src/routes/agent-runtime.js';

const task = {
  task: {
    id: 'task-1',
    projectId: 'project-1',
    environmentInstanceId: 'environment:primary:project-1',
    state: 'queued' as const,
    summary: 'Implementar API do agente',
    requestedCapabilities: ['workspace:write' as const],
    createdAt: '2026-09-23T10:00:00.000Z',
    updatedAt: '2026-09-23T10:00:00.000Z',
  },
  version: 1,
};

function realtimeService() {
  return {
    attach: async () => {
      throw new Error('unused');
    },
  };
}

function service(
  overrides: Partial<AgentRuntimeApiServicePort> = {},
): AgentRuntimeApiServicePort {
  return {
    listProviders: async () => [
      {
        providerId: 'codex',
        availability: 'available',
        observedAt: '2026-09-23T10:00:00.000Z',
        version: '1.0.0',
      },
    ],
    listTasks: async () => [task],
    createTask: async () => task,
    getTask: async () => task,
    status: async () => ({
      task,
      runtime: {
        taskId: 'task-1',
        projectId: 'project-1',
        canonicalVersion: 1,
        state: 'idle',
        attempts: 0,
        updatedAt: '2026-09-23T10:00:00.000Z',
      },
    }),
    execute: async () => ({
      execution: {
        id: 'execution-1',
        taskId: 'task-1',
        projectId: 'project-1',
        environmentInstanceId: 'environment:primary:project-1',
        requestedProviderId: 'codex',
        providerId: 'codex',
        state: 'succeeded',
        startedAt: '2026-09-23T10:01:00.000Z',
        finishedAt: '2026-09-23T10:02:00.000Z',
      },
      task: {
        ...task,
        task: { ...task.task, state: 'review' },
        version: 2,
      },
      providerResult: {
        providerId: 'codex',
        outcome: 'succeeded',
        summary: 'done',
      },
    }),
    cancel: async () => ({
      task,
      runtime: {
        taskId: 'task-1',
        projectId: 'project-1',
        canonicalVersion: 1,
        state: 'running',
        executionId: 'execution-1',
        processId: 123,
        attempts: 1,
        startedAt: '2026-09-23T10:01:00.000Z',
        updatedAt: '2026-09-23T10:01:00.000Z',
      },
      activeExecution: {
        projectId: 'project-1',
        taskId: 'task-1',
        executionId: 'execution-1',
        environmentInstanceId: 'environment:primary:project-1',
      },
    }),
    retry: async () => task,
    recover: async () => ({
      task,
      runtime: {
        taskId: 'task-1',
        projectId: 'project-1',
        canonicalVersion: 1,
        state: 'idle',
        attempts: 1,
        updatedAt: '2026-09-23T10:03:00.000Z',
        lastReason: 'operator-recovered',
      },
    }),
    resolveCheckpoint: async (
      _projectId,
      taskId,
      checkpointId,
      status,
      continuationInstruction,
    ) => ({
      task,
      checkpoint: {
        id: checkpointId,
        taskId,
        status,
        summary: 'Approval required.',
        requiredCapabilities: ['workspace:write'],
        createdAt: '2026-09-23T10:04:00.000Z',
        resolvedAt: '2026-09-23T10:05:00.000Z',
        ...(continuationInstruction ? { continuationInstruction } : {}),
      },
    }),
    activity: async () => ({
      authorizations: [
        {
          taskId: 'task-1',
          capability: 'workspace:write',
          granted: true,
          observedAt: '2026-09-23T10:04:00.000Z',
        },
      ],
      checkpoints: [],
      events: [],
      evidence: [],
    }),
    usage: async () => ({
      total: { executionCount: 0 },
      byProvider: {},
    }),
    setAuthorization: async (_projectId, taskId, capability, granted) => ({
      taskId,
      capability,
      granted,
      observedAt: '2026-09-23T10:04:00.000Z',
    }),
    shutdown: async () => undefined,
    ...overrides,
  };
}

test('Agent Runtime HTTP sanitiza autoridade de processo/path antes do service', async (context) => {
  const creates: AgentTaskCreateInput[] = [];
  const app = Fastify();
  registerApiErrorHandling(app);
  app.register(agentRuntimeRoutes, {
    prefix: '/api',
    agentRuntimeRealtimeService: realtimeService(),
    agentRuntimeApiService: service({
      createTask: async (_projectId, input) => {
        creates.push(input);
        return task;
      },
    }),
  });
  context.after(() => app.close());

  const created = await app.inject({
    method: 'POST',
    url: '/api/projects/project-1/agent/tasks',
    payload: {
      summary: '  Implementar API do agente  ',
      environmentInstanceId: 'environment:primary:project-1',
      taskContextId: 'context-1',
      requestedCapabilities: ['workspace:write'],
      branch: 'caller-controlled',
      worktreeId: 'caller-controlled',
    },
  });
  assert.equal(created.statusCode, 201);
  assert.equal(creates.length, 1);
  assert.equal(creates[0]?.summary, '  Implementar API do agente  ');
  assert.equal(creates[0]?.taskContextId, 'context-1');
  assert.equal(
    (creates[0] as AgentTaskCreateInput & Record<string, unknown>).branch,
    undefined,
  );
  assert.equal(
    (creates[0] as AgentTaskCreateInput & Record<string, unknown>).worktreeId,
    undefined,
  );

  for (const forbidden of [
    { cwd: '/tmp/owned' },
    { executable: 'bash' },
    { argv: ['-lc', 'rm -rf /'] },
    { providerId: 'codex' },
  ]) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/projects/project-1/agent/tasks',
      payload: { summary: 'x', ...forbidden },
    });
    assert.equal(response.statusCode, 201);
    const forwarded = creates.at(-1) as AgentTaskCreateInput &
      Record<string, unknown>;
    for (const key of Object.keys(forbidden)) {
      assert.equal(forwarded[key], undefined);
    }
  }

  const executeAbuse = await app.inject({
    method: 'POST',
    url: '/api/projects/project-1/agent/tasks/task-1/executions',
    payload: { providerId: 'codex', cwd: '/tmp/escape' },
  });
  assert.equal(executeAbuse.statusCode, 200);
});

test('Agent Runtime HTTP expõe providers e lifecycle com respostas sanitizadas por schema', async (context) => {
  const calls: string[] = [];
  const app = Fastify();
  registerApiErrorHandling(app);
  app.register(agentRuntimeRoutes, {
    prefix: '/api',
    agentRuntimeRealtimeService: realtimeService(),
    agentRuntimeApiService: service({
      listProviders: async () =>
        [
          {
            providerId: 'codex',
            availability: 'available',
            observedAt: '2026-09-23T10:00:00.000Z',
            version: '1.0.0',
            internalSecret: 'hidden',
          },
        ] as never,
      execute: async (_projectId, _taskId, providerId) => {
        calls.push(String(providerId));
        return service().execute('project-1', 'task-1', providerId);
      },
    }),
  });
  context.after(() => app.close());

  const providers = await app.inject({
    method: 'GET',
    url: '/api/agent/providers',
  });
  assert.equal(providers.statusCode, 200);
  assert.equal(
    providers.json<{ providers: Array<{ internalSecret?: string }> }>()
      .providers[0]?.internalSecret,
    undefined,
  );

  const list = await app.inject({
    method: 'GET',
    url: '/api/projects/project-1/agent/tasks',
  });
  assert.equal(list.statusCode, 200);

  const status = await app.inject({
    method: 'GET',
    url: '/api/projects/project-1/agent/tasks/task-1/status',
  });
  assert.equal(status.statusCode, 200);

  const execution = await app.inject({
    method: 'POST',
    url: '/api/projects/project-1/agent/tasks/task-1/executions',
    payload: { providerId: 'codex' },
  });
  assert.equal(execution.statusCode, 200);
  assert.deepEqual(calls, ['codex']);

  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: '/api/projects/project-1/agent/tasks/task-1/cancel',
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: '/api/projects/project-1/agent/tasks/task-1/retry',
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: '/api/projects/project-1/agent/tasks/task-1/recover',
      })
    ).statusCode,
    200,
  );
});

test('Agent Runtime HTTP expõe usage agregado por projeto e task', async (context) => {
  const calls: Array<[string, string?]> = [];
  const app = Fastify();
  registerApiErrorHandling(app);
  app.register(agentRuntimeRoutes, {
    prefix: '/api',
    agentRuntimeRealtimeService: realtimeService(),
    agentRuntimeApiService: service({
      usage: async (projectId, taskId) => {
        calls.push([projectId, taskId]);
        return {
          total: {
            executionCount: 2,
            inputTokens: 150,
            outputTokens: 42,
            reportedCostUsd: 0.02,
            durationMs: 4_000,
          },
          byProvider: {
            codex: {
              executionCount: 1,
              inputTokens: 100,
              outputTokens: 30,
            },
            'claude-code': {
              executionCount: 1,
              inputTokens: 50,
              outputTokens: 12,
              reportedCostUsd: 0.02,
              durationMs: 4_000,
            },
          },
        };
      },
    }),
  });
  context.after(() => app.close());

  const projectUsage = await app.inject({
    method: 'GET',
    url: '/api/projects/project-1/agent/usage',
  });
  assert.equal(projectUsage.statusCode, 200);
  assert.equal(projectUsage.json().total.executionCount, 2);

  const taskUsage = await app.inject({
    method: 'GET',
    url: '/api/projects/project-1/agent/tasks/task-1/usage',
  });
  assert.equal(taskUsage.statusCode, 200);
  assert.equal(taskUsage.json().byProvider['claude-code'].reportedCostUsd, 0.02);
  assert.deepEqual(calls, [
    ['project-1', undefined],
    ['project-1', 'task-1'],
  ]);
});

test('Agent Runtime HTTP expõe autorização específica e activity bounded', async (context) => {
  const calls: unknown[] = [];
  const app = Fastify();
  registerApiErrorHandling(app);
  app.register(agentRuntimeRoutes, {
    prefix: '/api',
    agentRuntimeRealtimeService: realtimeService(),
    agentRuntimeApiService: service({
      setAuthorization: async (...args) => {
        calls.push(args);
        return {
          taskId: args[1],
          capability: args[2],
          granted: args[3],
          observedAt: '2026-09-23T11:00:00.000Z',
        };
      },
      activity: async () => ({
        authorizations: [
          {
            taskId: 'task-1',
            capability: 'workspace:write',
            granted: true,
            observedAt: '2026-09-23T11:00:00.000Z',
          },
        ],
        checkpoints: [
          {
            id: 'checkpoint-1',
            taskId: 'task-1',
            executionId: 'execution-1',
            status: 'pending',
            summary: 'Approval required.',
            requiredCapabilities: ['workspace:write'],
            createdAt: '2026-09-23T10:59:00.000Z',
          },
        ],
        events: [
          {
            id: 'event-1',
            taskId: 'task-1',
            type: 'authorization',
            summary: 'Capability workspace:write granted.',
            occurredAt: '2026-09-23T11:00:00.000Z',
          },
        ],
        evidence: [
          {
            id: 'evidence-1',
            taskId: 'task-1',
            executionId: 'execution-1',
            kind: 'test',
            summary: 'Tests passed.',
            observedAt: '2026-09-23T11:01:00.000Z',
          },
        ],
      }),
    }),
  });
  context.after(() => app.close());

  const authorization = await app.inject({
    method: 'POST',
    url: '/api/projects/project-1/agent/tasks/task-1/authorizations',
    payload: {
      capability: 'workspace:write',
      granted: true,
      cwd: '/tmp/ignored',
    },
  });
  assert.equal(authorization.statusCode, 200);
  assert.deepEqual(calls, [['project-1', 'task-1', 'workspace:write', true]]);

  const activity = await app.inject({
    method: 'GET',
    url: '/api/projects/project-1/agent/tasks/task-1/activity',
  });
  assert.equal(activity.statusCode, 200);
  assert.equal(
    activity.json<{ authorizations: unknown[] }>().authorizations.length,
    1,
  );

  const invalid = await app.inject({
    method: 'POST',
    url: '/api/projects/project-1/agent/tasks/task-1/authorizations',
    payload: {
      capability: 'shell:arbitrary',
      granted: true,
    },
  });
  assert.equal(invalid.statusCode, 400);
});

test('Agent Runtime HTTP resolve checkpoint exige decisão explícita e sanitiza payload', async (context) => {
  const calls: unknown[] = [];
  const app = Fastify();
  registerApiErrorHandling(app);
  app.register(agentRuntimeRoutes, {
    prefix: '/api',
    agentRuntimeRealtimeService: realtimeService(),
    agentRuntimeApiService: service({
      resolveCheckpoint: async (...args) => {
        calls.push(args);
        return {
          task,
          checkpoint: {
            id: args[2],
            taskId: args[1],
            status: args[3],
            summary: 'Approval required.',
            requiredCapabilities: ['workspace:write'],
            createdAt: '2026-09-23T11:00:00.000Z',
            resolvedAt: '2026-09-23T11:01:00.000Z',
            ...(args[4] ? { continuationInstruction: args[4] } : {}),
          },
        };
      },
    }),
  });
  context.after(() => app.close());

  const response = await app.inject({
    method: 'POST',
    url: '/api/projects/project-1/agent/tasks/task-1/checkpoints/checkpoint-1/resolve',
    payload: {
      decision: 'approved',
      instruction: 'Continue with tests.',
      cwd: '/tmp/ignored',
      executable: 'bash',
    },
  });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(calls, [
    ['project-1', 'task-1', 'checkpoint-1', 'approved', 'Continue with tests.'],
  ]);

  const invalid = await app.inject({
    method: 'POST',
    url: '/api/projects/project-1/agent/tasks/task-1/checkpoints/checkpoint-1/resolve',
    payload: { decision: 'maybe' },
  });
  assert.equal(invalid.statusCode, 400);
});
