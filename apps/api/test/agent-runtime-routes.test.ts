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
    activity: async () => ({
      authorizations: [
        {
          taskId: 'task-1',
          capability: 'workspace:write',
          granted: true,
          observedAt: '2026-09-23T10:04:00.000Z',
        },
      ],
      events: [],
      evidence: [],
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
      requestedCapabilities: ['workspace:write'],
    },
  });
  assert.equal(created.statusCode, 201);
  assert.equal(creates.length, 1);
  assert.equal(creates[0]?.summary, '  Implementar API do agente  ');

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
