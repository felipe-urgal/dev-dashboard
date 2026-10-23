import assert from 'node:assert/strict';
import test from 'node:test';

import Fastify from 'fastify';

import {
  AgentRuntimeApiServiceError,
  type AgentRuntimeApiServicePort,
  type AgentTaskCreateInput,
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
    getExecutionProfiles: async () => null,
    setExecutionProfiles: async (projectId, input) => ({
      projectId,
      ...(input.defaultProfileId
        ? { defaultProfileId: input.defaultProfileId }
        : {}),
      profiles: input.profiles,
      updatedAt: '2026-09-23T10:00:00.000Z',
    }),
    getProviderPreference: async () => null,
    setProviderPreference: async (projectId, input) => ({
      projectId,
      preferredProviderId: input.preferredProviderId,
      fallbackOrder: input.fallbackOrder ?? [],
      updatedAt: '2026-09-23T10:00:00.000Z',
    }),
    clearProviderPreference: async () => undefined,
    listTasks: async () => [task],
    createTask: async () => task,
    getTask: async () => task,
    adoptGitRef: async (_projectId, _taskId, input) => ({
      ...task,
      task: {
        ...task.task,
        adoptedGitRef: {
          branch: input.branch,
          commitHash: input.commitHash.toLowerCase(),
          verifiedAt: '2026-09-23T10:00:30.000Z',
        },
        updatedAt: '2026-09-23T10:00:30.000Z',
      },
      version: 2,
    }),
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
    conversation: async () => [],
    listAttachments: async () => [],
    createAttachment: async (_projectId, taskId, input) => ({
      id: 'attachment-1',
      taskId,
      filename: input.filename,
      mediaType: input.mediaType,
      byteSize: 4,
      sha256: 'a'.repeat(64),
      source: 'user-upload',
      createdAt: '2026-09-23T10:00:00.000Z',
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
    completeTask: async () => ({
      task: {
        ...task,
        task: {
          ...task.task,
          state: 'completed',
          updatedAt: '2026-09-23T10:03:30.000Z',
        },
        version: 2,
      },
      handoffEvidence: {
        id: 'completion-1',
        taskId: 'task-1',
        kind: 'other',
        summary: 'Agent task completed with explicit operator confirmation.',
        observedAt: '2026-09-23T10:03:30.000Z',
      },
      cleanup: {
        status: 'eligible',
        worktreeId: 'worktree-123',
        environmentInstanceId: 'environment:worktree:project-1:worktree-123',
        confirmationToken: 'cleanup-token',
        expiresAt: '2026-09-23T10:04:30.000Z',
      },
    }),
    cleanupCompletedTask: async () => ({
      status: 'removed',
      worktreeId: 'worktree-123',
      environmentInstanceId: 'environment:worktree:project-1:worktree-123',
    }),
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
    refreshPullRequestFeedback: async () => ({
      status: 'attention',
      observedAt: '2026-09-23T10:04:30.000Z',
      evidence: [
        {
          id: 'pr-feedback-1',
          taskId: 'task-1',
          kind: 'pull-request',
          summary: 'PR #12; CI failure; review changes-requested.',
          reference: 'https://github.com/felipe-urgal/dev-dashboard/pull/12',
          observedAt: '2026-09-23T10:04:30.000Z',
        },
      ],
      newEvidenceCount: 1,
      automaticContinuation: false,
      pullRequest: {
        number: 12,
        url: 'https://github.com/felipe-urgal/dev-dashboard/pull/12',
        ciStatus: 'failure',
        reviewState: 'changes-requested',
        remoteStatus: 'available',
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
    budget: async () => ({
      budget: null,
      usage: { executionCount: 0 },
      alerts: [],
      blocking: false,
    }),
    setBudget: async (_projectId, _taskId, input) => ({
      budget: {
        projectId: 'project-1',
        taskId: 'task-1',
        ...input,
        updatedAt: '2026-09-23T12:00:00.000Z',
      },
      usage: { executionCount: 0 },
      alerts: [],
      blocking: false,
    }),
    clearBudget: async () => ({
      budget: null,
      usage: { executionCount: 0 },
      alerts: [],
      blocking: false,
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

test('Agent Runtime HTTP conclui task e confirma cleanup sem aceitar path/worktree do browser', async (context) => {
  const calls: unknown[] = [];
  const app = Fastify();
  registerApiErrorHandling(app);
  app.register(agentRuntimeRoutes, {
    prefix: '/api',
    agentRuntimeRealtimeService: realtimeService(),
    agentRuntimeApiService: service({
      completeTask: async (...args) => {
        calls.push(['complete', ...args]);
        return {
          task: {
            ...task,
            task: {
              ...task.task,
              state: 'completed',
              updatedAt: '2026-09-26T18:20:00.000Z',
            },
            version: 2,
          },
          handoffEvidence: {
            id: 'completion-1',
            taskId: 'task-1',
            kind: 'other',
            summary:
              'Agent task completed with explicit operator confirmation.',
            observedAt: '2026-09-26T18:20:00.000Z',
          },
          cleanup: {
            status: 'eligible',
            worktreeId: 'worktree-owned',
            confirmationToken: 'owned-token',
          },
        };
      },
      cleanupCompletedTask: async (...args) => {
        calls.push(['cleanup', ...args]);
        return {
          status: 'removed',
          worktreeId: 'worktree-owned',
        };
      },
    }),
  });
  context.after(() => app.close());

  const completed = await app.inject({
    method: 'POST',
    url: '/api/projects/project-1/agent/tasks/task-1/complete',
    payload: {
      confirmed: true,
      worktreeId: 'browser-controlled',
      path: '/tmp/escape',
    },
  });
  assert.equal(completed.statusCode, 200);
  assert.equal(completed.json().task.task.state, 'completed');
  assert.equal(completed.json().cleanup.worktreeId, 'worktree-owned');

  const cleaned = await app.inject({
    method: 'POST',
    url: '/api/projects/project-1/agent/tasks/task-1/cleanup',
    payload: {
      confirmationToken: 'owned-token',
      worktreeId: 'browser-controlled',
      path: '/tmp/escape',
    },
  });
  assert.equal(cleaned.statusCode, 200);
  assert.equal(cleaned.json().status, 'removed');
  assert.deepEqual(calls, [
    ['complete', 'project-1', 'task-1', true],
    ['cleanup', 'project-1', 'task-1', 'owned-token'],
  ]);
});

test('Agent Runtime HTTP expõe refresh explícito de feedback do PR', async (context) => {
  const calls: unknown[] = [];
  const app = Fastify();
  registerApiErrorHandling(app);
  app.register(agentRuntimeRoutes, {
    prefix: '/api',
    agentRuntimeRealtimeService: realtimeService(),
    agentRuntimeApiService: service({
      refreshPullRequestFeedback: async (...args) => {
        calls.push(args);
        return {
          status: 'attention',
          observedAt: '2026-09-26T15:00:00.000Z',
          evidence: [
            {
              id: 'pr-feedback-1',
              taskId: 'task-1',
              kind: 'pull-request',
              summary: 'PR #12; CI failure.',
              reference:
                'https://github.com/felipe-urgal/dev-dashboard/pull/12',
              observedAt: '2026-09-26T15:00:00.000Z',
            },
          ],
          newEvidenceCount: 1,
          automaticContinuation: false,
          pullRequest: {
            number: 12,
            url: 'https://github.com/felipe-urgal/dev-dashboard/pull/12',
            ciStatus: 'failure',
            reviewState: 'unknown',
            remoteStatus: 'available',
          },
        };
      },
    }),
  });
  context.after(() => app.close());

  const response = await app.inject({
    method: 'POST',
    url: '/api/projects/project-1/agent/tasks/task-1/pull-request-feedback/refresh',
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().status, 'attention');
  assert.equal(response.json().automaticContinuation, false);
  assert.deepEqual(calls, [['project-1', 'task-1']]);
});

test('Agent Runtime HTTP expõe conversa e submete turno sem autoridade extra', async (context) => {
  const calls: unknown[] = [];
  const userTurn = {
    id: 'turn-user-2',
    taskId: 'task-1',
    role: 'user' as const,
    content: 'Ajuste também o estado vazio.',
    createdAt: '2026-09-23T10:06:00.000Z',
  };
  const agentTurn = {
    id: 'turn-agent-2',
    taskId: 'task-1',
    role: 'agent' as const,
    content: 'Estado vazio ajustado.',
    createdAt: '2026-09-23T10:07:00.000Z',
    executionId: 'execution-2',
    providerId: 'codex' as const,
  };
  const app = Fastify();
  registerApiErrorHandling(app);
  app.register(agentRuntimeRoutes, {
    prefix: '/api',
    agentRuntimeRealtimeService: realtimeService(),
    agentRuntimeApiService: service({
      conversation: async (...args) => {
        calls.push(['conversation', ...args]);
        return [userTurn, agentTurn];
      },
      execute: async (...args) => {
        calls.push(['execute', ...args]);
        return {
          execution: {
            id: 'execution-2',
            taskId: 'task-1',
            projectId: 'project-1',
            environmentInstanceId: 'environment:primary:project-1',
            requestedProviderId: 'codex',
            providerId: 'codex',
            state: 'succeeded',
            startedAt: '2026-09-23T10:06:00.000Z',
            finishedAt: '2026-09-23T10:07:00.000Z',
          },
          task: {
            ...task,
            task: { ...task.task, state: 'review' },
            version: 2,
          },
          providerResult: {
            providerId: 'codex',
            outcome: 'succeeded',
            summary: 'Agent execution completed.',
            responseText: 'Estado vazio ajustado.',
          },
          userTurn,
          agentTurn,
        };
      },
    }),
  });
  context.after(() => app.close());

  const conversation = await app.inject({
    method: 'GET',
    url: '/api/projects/project-1/agent/tasks/task-1/conversation',
  });
  assert.equal(conversation.statusCode, 200);
  assert.deepEqual(conversation.json().turns, [userTurn, agentTurn]);

  const submitted = await app.inject({
    method: 'POST',
    url: '/api/projects/project-1/agent/tasks/task-1/turns',
    payload: {
      id: 'turn-user-2',
      content: 'Ajuste também o estado vazio.',
      providerId: 'codex',
      cwd: '/tmp/escape',
      requestedCapabilities: ['github:merge'],
    },
  });
  assert.equal(submitted.statusCode, 200);
  assert.equal(submitted.json().agentTurn.executionId, 'execution-2');
  assert.equal(
    submitted.json().providerResult.responseText,
    'Estado vazio ajustado.',
  );
  assert.deepEqual(calls, [
    ['conversation', 'project-1', 'task-1'],
    [
      'execute',
      'project-1',
      'task-1',
      'codex',
      {
        id: 'turn-user-2',
        content: 'Ajuste também o estado vazio.',
      },
    ],
  ]);
});

test('Agent Runtime HTTP rejeita reenvio do mesmo turnId como conflito', async (context) => {
  const app = Fastify();
  registerApiErrorHandling(app);
  app.register(agentRuntimeRoutes, {
    prefix: '/api',
    agentRuntimeRealtimeService: realtimeService(),
    agentRuntimeApiService: service({
      execute: async () => {
        throw new AgentRuntimeApiServiceError(
          'AGENT_WORKFLOW_TURN_ALREADY_SUBMITTED',
          'Agent conversation turn was already submitted.',
        );
      },
    }),
  });
  context.after(() => app.close());

  const response = await app.inject({
    method: 'POST',
    url: '/api/projects/project-1/agent/tasks/task-1/turns',
    payload: {
      id: 'turn-repeat',
      content: 'Continue.',
    },
  });
  assert.equal(response.statusCode, 409);
});

test('Agent Runtime HTTP configura preferência de provider por projeto', async (context) => {
  const calls: unknown[] = [];
  const app = Fastify();
  registerApiErrorHandling(app);
  app.register(agentRuntimeRoutes, {
    prefix: '/api',
    agentRuntimeRealtimeService: realtimeService(),
    agentRuntimeApiService: service({
      setProviderPreference: async (...args) => {
        calls.push(['set', ...args]);
        return {
          projectId: args[0],
          preferredProviderId: args[1].preferredProviderId,
          fallbackOrder: args[1].fallbackOrder ?? [],
          updatedAt: '2026-09-23T10:00:00.000Z',
        };
      },
      getProviderPreference: async (projectId) => {
        calls.push(['get', projectId]);
        return {
          projectId,
          preferredProviderId: 'claude-code',
          fallbackOrder: ['codex'],
          updatedAt: '2026-09-23T10:00:00.000Z',
        };
      },
      clearProviderPreference: async (projectId) => {
        calls.push(['clear', projectId]);
      },
    }),
  });
  context.after(() => app.close());

  const saved = await app.inject({
    method: 'PUT',
    url: '/api/projects/project-1/agent/provider-preference',
    payload: {
      preferredProviderId: 'claude-code',
      fallbackOrder: ['codex'],
      command: 'ignored',
    },
  });
  assert.equal(saved.statusCode, 200);
  assert.deepEqual(calls[0], [
    'set',
    'project-1',
    {
      preferredProviderId: 'claude-code',
      fallbackOrder: ['codex'],
    },
  ]);

  const current = await app.inject({
    method: 'GET',
    url: '/api/projects/project-1/agent/provider-preference',
  });
  assert.equal(current.statusCode, 200);
  assert.equal(current.json().preference.preferredProviderId, 'claude-code');

  const cleared = await app.inject({
    method: 'DELETE',
    url: '/api/projects/project-1/agent/provider-preference',
  });
  assert.equal(cleared.statusCode, 204);
  assert.deepEqual(calls.at(-1), ['clear', 'project-1']);

  const invalid = await app.inject({
    method: 'PUT',
    url: '/api/projects/project-1/agent/provider-preference',
    payload: {
      preferredProviderId: 'chatgpt-browser',
    },
  });
  assert.equal(invalid.statusCode, 400);
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
            providerId: 'automatic',
            availability: 'available',
            observedAt: '2026-09-23T10:00:00.000Z',
            selectedProviderId: 'codex',
            reason: 'selected codex',
            diagnostic: {
              code: 'ready',
              evidence: 'Automatic selected codex.',
              secret: 'hidden-diagnostic',
            },
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
  const providerStatus = providers.json<{
    providers: Array<{
      selectedProviderId?: string;
      diagnostic?: {
        code?: string;
        evidence?: string;
        secret?: string;
      };
      internalSecret?: string;
    }>;
  }>().providers[0];
  assert.equal(providerStatus?.selectedProviderId, 'codex');
  assert.equal(providerStatus?.diagnostic?.code, 'ready');
  assert.equal(
    providerStatus?.diagnostic?.evidence,
    'Automatic selected codex.',
  );
  assert.equal(providerStatus?.diagnostic?.secret, undefined);
  assert.equal(providerStatus?.internalSecret, undefined);

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

test('Agent Runtime HTTP adota ref somente por payload estruturado', async (context) => {
  const calls: unknown[] = [];
  const app = Fastify();
  registerApiErrorHandling(app);
  app.register(agentRuntimeRoutes, {
    prefix: '/api',
    agentRuntimeRealtimeService: realtimeService(),
    agentRuntimeApiService: service({
      adoptGitRef: async (...args) => {
        calls.push(args);
        return {
          ...task,
          task: {
            ...task.task,
            adoptedGitRef: {
              branch: 'feature/existing',
              commitHash: 'a'.repeat(40),
              verifiedAt: '2026-09-23T10:00:30.000Z',
            },
            updatedAt: '2026-09-23T10:00:30.000Z',
          },
          version: 2,
        };
      },
    }),
  });
  context.after(() => app.close());

  const response = await app.inject({
    method: 'POST',
    url: '/api/projects/project-1/agent/tasks/task-1/adopt-ref',
    payload: {
      branch: 'feature/existing',
      commitHash: 'A'.repeat(40),
      confirmed: true,
      cwd: '/tmp/ignored',
      argv: ['rev-parse', 'HEAD'],
    },
  });

  assert.equal(response.statusCode, 200);
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
  assert.equal(
    response.json().task.task.adoptedGitRef.commitHash,
    'a'.repeat(40),
  );
  assert.equal(JSON.stringify(calls).includes('/tmp/ignored'), false);
  assert.equal(JSON.stringify(calls).includes('rev-parse'), false);
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
  assert.equal(
    taskUsage.json().byProvider['claude-code'].reportedCostUsd,
    0.02,
  );
  assert.deepEqual(calls, [
    ['project-1', undefined],
    ['project-1', 'task-1'],
  ]);
});

test('Agent Runtime HTTP configura e remove budget soft/hard por task', async (context) => {
  const calls: unknown[] = [];
  const app = Fastify();
  registerApiErrorHandling(app);
  app.register(agentRuntimeRoutes, {
    prefix: '/api',
    agentRuntimeRealtimeService: realtimeService(),
    agentRuntimeApiService: service({
      budget: async (projectId, taskId) => {
        calls.push(['get', projectId, taskId]);
        return {
          budget: {
            projectId,
            taskId,
            maxTotalTokens: 10_000,
            mode: 'hard',
            updatedAt: '2026-09-23T12:00:00.000Z',
          },
          usage: { executionCount: 1, totalTokens: 12_000 },
          alerts: [
            {
              kind: 'total-tokens',
              observed: 12_000,
              threshold: 10_000,
            },
          ],
          blocking: true,
        };
      },
      setBudget: async (projectId, taskId, input) => {
        calls.push(['set', projectId, taskId, input]);
        return {
          budget: {
            projectId,
            taskId,
            ...input,
            updatedAt: '2026-09-23T12:00:00.000Z',
          },
          usage: { executionCount: 0 },
          alerts: [],
          blocking: false,
        };
      },
      clearBudget: async (projectId, taskId) => {
        calls.push(['clear', projectId, taskId]);
        return {
          budget: null,
          usage: { executionCount: 0 },
          alerts: [],
          blocking: false,
        };
      },
    }),
  });
  context.after(() => app.close());

  const current = await app.inject({
    method: 'GET',
    url: '/api/projects/project-1/agent/tasks/task-1/budget',
  });
  assert.equal(current.statusCode, 200);
  assert.equal(current.json().alerts[0].kind, 'total-tokens');

  const saved = await app.inject({
    method: 'PUT',
    url: '/api/projects/project-1/agent/tasks/task-1/budget',
    payload: {
      maxTotalTokens: 20_000,
      maxEstimatedCostUsd: 1.5,
      mode: 'hard',
      hardStop: true,
    },
  });
  assert.equal(saved.statusCode, 200);
  assert.equal(saved.json().budget.maxEstimatedCostUsd, 1.5);
  assert.deepEqual(calls[1], [
    'set',
    'project-1',
    'task-1',
    {
      maxTotalTokens: 20_000,
      maxEstimatedCostUsd: 1.5,
      mode: 'hard',
    },
  ]);

  const invalid = await app.inject({
    method: 'PUT',
    url: '/api/projects/project-1/agent/tasks/task-1/budget',
    payload: {},
  });
  assert.equal(invalid.statusCode, 400);

  const cleared = await app.inject({
    method: 'DELETE',
    url: '/api/projects/project-1/agent/tasks/task-1/budget',
  });
  assert.equal(cleared.statusCode, 200);
  assert.equal(cleared.json().budget, null);
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
      scope: {
        kind: 'branch',
        projectId: 'attacker-project',
        branch: 'main',
      },
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

test('Agent Runtime HTTP adota backlog por intenção estruturada sem aceitar autoridade extra', async (context) => {
  const calls: unknown[] = [];
  const app = Fastify();
  registerApiErrorHandling(app);
  app.register(agentRuntimeRoutes, {
    prefix: '/api',
    agentRuntimeRealtimeService: realtimeService(),
    agentRuntimeApiService: service({
      adoptBacklog: async (...args) => {
        calls.push(args);
        return {
          status: 'adopted',
          source: 'specific-issue',
          issue: {
            repository: 'felipe-urgal/dev-dashboard',
            number: 893,
            title: 'Adotar backlog pelo composer',
            labels: [],
          },
          candidates: [],
          task,
          reused: false,
          internalPath: '/secret/worktree',
        } as never;
      },
    }),
  });
  context.after(() => app.close());

  const response = await app.inject({
    method: 'POST',
    url: '/api/projects/project-1/agent/adopt-backlog',
    payload: {
      issueNumber: 893,
      environmentInstanceId: 'environment:primary:project-1',
      requestedCapabilities: ['workspace:write'],
      cwd: '/tmp/caller-controlled',
      argv: ['bash', '-lc', 'whoami'],
    },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(calls, [
    [
      'project-1',
      {
        issueNumber: 893,
        environmentInstanceId: 'environment:primary:project-1',
        requestedCapabilities: ['workspace:write'],
      },
    ],
  ]);
  assert.equal(response.json().result.issue.number, 893);
  assert.equal(response.json().result.internalPath, undefined);
  assert.equal(JSON.stringify(calls).includes('/tmp/caller-controlled'), false);
  assert.equal(JSON.stringify(calls).includes('whoami'), false);
});

test('Agent Runtime HTTP expõe ambiguidade do backlog sem escolher silenciosamente', async (context) => {
  const app = Fastify();
  registerApiErrorHandling(app);
  app.register(agentRuntimeRoutes, {
    prefix: '/api',
    agentRuntimeRealtimeService: realtimeService(),
    agentRuntimeApiService: service({
      adoptBacklog: async () => ({
        status: 'ambiguous',
        source: 'priority-tie',
        candidates: [
          {
            repository: 'felipe-urgal/dev-dashboard',
            number: 893,
            title: 'A',
            labels: ['priority:p1'],
          },
          {
            repository: 'felipe-urgal/dev-dashboard',
            number: 895,
            title: 'B',
            labels: ['priority:p1'],
          },
        ],
        reused: false,
      }),
    }),
  });
  context.after(() => app.close());

  const response = await app.inject({
    method: 'POST',
    url: '/api/projects/project-1/agent/adopt-backlog',
    payload: {},
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().result.status, 'ambiguous');
  assert.deepEqual(
    response
      .json()
      .result.candidates.map((issue: { number: number }) => issue.number),
    [893, 895],
  );
});

test('Agent Runtime HTTP anexa por conteúdo bounded sem aceitar path do browser', async (context) => {
  const calls: unknown[] = [];
  const app = Fastify();
  registerApiErrorHandling(app);
  app.register(agentRuntimeRoutes, {
    prefix: '/api',
    agentRuntimeRealtimeService: realtimeService(),
    agentRuntimeApiService: service({
      createAttachment: async (...args) => {
        calls.push(args);
        return {
          id: 'attachment-1',
          taskId: args[1],
          filename: args[2].filename,
          mediaType: args[2].mediaType,
          byteSize: 4,
          sha256: 'b'.repeat(64),
          source: 'user-upload',
          createdAt: '2026-09-26T18:45:00.000Z',
        };
      },
    }),
  });
  context.after(() => app.close());

  const response = await app.inject({
    method: 'POST',
    url: '/api/projects/project-1/agent/tasks/task-1/attachments',
    payload: {
      filename: 'ci.log',
      mediaType: 'text/plain',
      contentBase64: Buffer.from('fail').toString('base64'),
      path: '/tmp/escape',
    },
  });

  assert.equal(response.statusCode, 201);
  assert.deepEqual(calls, [
    [
      'project-1',
      'task-1',
      {
        filename: 'ci.log',
        mediaType: 'text/plain',
        contentBase64: Buffer.from('fail').toString('base64'),
      },
    ],
  ]);
});

test('Agent Runtime HTTP persiste perfis e encaminha somente profileId na execução', async (context) => {
  const calls: unknown[] = [];
  const app = Fastify();
  registerApiErrorHandling(app);
  app.register(agentRuntimeRoutes, {
    prefix: '/api',
    agentRuntimeRealtimeService: realtimeService(),
    agentRuntimeApiService: service({
      setExecutionProfiles: async (projectId, input) => {
        calls.push(['profiles', projectId, input]);
        return {
          projectId,
          ...input,
          updatedAt: '2026-09-26T20:00:00.000Z',
        };
      },
      execute: async (...args) => {
        calls.push(['execute', ...args]);
        return service().execute('project-1', 'task-1');
      },
    }),
  });
  context.after(() => app.close());

  const saved = await app.inject({
    method: 'PUT',
    url: '/api/projects/project-1/agent/execution-profiles',
    payload: {
      defaultProfileId: 'normal',
      profiles: [
        {
          id: 'normal',
          label: 'Normal',
          providerId: 'automatic',
          fallbackOrder: ['codex', 'claude-code'],
          timeoutMs: 120000,
          requestedCapabilities: ['workspace:write'],
        },
      ],
    },
  });
  assert.equal(saved.statusCode, 200);

  const executed = await app.inject({
    method: 'POST',
    url: '/api/projects/project-1/agent/tasks/task-1/executions',
    payload: {
      providerId: 'automatic',
      profileId: 'normal',
      timeoutMs: 1,
      model: 'caller-controlled',
    },
  });
  assert.equal(executed.statusCode, 200);

  assert.deepEqual(calls[0], [
    'profiles',
    'project-1',
    {
      defaultProfileId: 'normal',
      profiles: [
        {
          id: 'normal',
          label: 'Normal',
          providerId: 'automatic',
          fallbackOrder: ['codex', 'claude-code'],
          timeoutMs: 120000,
          requestedCapabilities: ['workspace:write'],
        },
      ],
    },
  ]);
  assert.deepEqual(calls[1], [
    'execute',
    'project-1',
    'task-1',
    'automatic',
    undefined,
    undefined,
    'normal',
  ]);
});

test('opt-in task cursor route preserves legacy response and bounds inputs', async (t) => {
  const calls: Array<{ projectId: string; limit: number; cursor?: string }> =
    [];
  const cursor = 'a'.repeat(64);
  const app = Fastify();
  registerApiErrorHandling(app);
  app.register(agentRuntimeRoutes, {
    prefix: '/api',
    agentRuntimeRealtimeService: realtimeService(),
    agentRuntimeApiService: service({
      listTasksPage: async (projectId, options) => {
        calls.push({ projectId, ...options });
        return { tasks: [task], nextCursor: options.cursor ? null : cursor };
      },
    }),
  });
  t.after(() => app.close());

  const legacy = await app.inject({
    method: 'GET',
    url: '/api/projects/project-1/agent/tasks',
  });
  assert.equal(legacy.statusCode, 200);
  assert.deepEqual(legacy.json(), { tasks: [task] });
  assert.equal(calls.length, 0);

  const first = await app.inject({
    method: 'GET',
    url: '/api/projects/project-1/agent/tasks?limit=2',
  });
  assert.equal(first.statusCode, 200);
  assert.deepEqual(first.json(), { tasks: [task], nextCursor: cursor });

  const second = await app.inject({
    method: 'GET',
    url: '/api/projects/project-1/agent/tasks?limit=1&cursor=' + cursor,
  });
  assert.equal(second.statusCode, 200);
  assert.deepEqual(second.json(), { tasks: [task], nextCursor: null });
  assert.deepEqual(calls, [
    { projectId: 'project-1', limit: 2 },
    { projectId: 'project-1', limit: 1, cursor },
  ]);

  for (const suffix of [
    '?limit=0',
    '?limit=51',
    '?limit=invalid',
    '?limit=1&cursor=bad',
  ]) {
    const response = await app.inject({
      method: 'GET',
      url: '/api/projects/project-1/agent/tasks' + suffix,
    });
    assert.equal(response.statusCode, 400);
  }
  assert.equal(calls.length, 2);
});

test('priority task cursor is opt-in and forwards revision-scoped cursor', async (t) => {
  const calls: Array<{ limit: number; cursor?: string; order?: 'priority' }> =
    [];
  const cursor = 'a'.repeat(40) + '.' + 'b'.repeat(64);
  const app = Fastify();
  registerApiErrorHandling(app);
  app.register(agentRuntimeRoutes, {
    prefix: '/api',
    agentRuntimeRealtimeService: realtimeService(),
    agentRuntimeApiService: service({
      listTasksPage: async (_projectId, options) => {
        calls.push(options);
        return { tasks: [task], nextCursor: options.cursor ? null : cursor };
      },
    }),
  });
  t.after(() => app.close());

  const initial = await app.inject({
    method: 'GET',
    url: '/api/projects/project-1/agent/tasks?order=priority&limit=1',
  });
  assert.equal(initial.statusCode, 200);
  assert.equal(initial.json().nextCursor, cursor);

  const next = await app.inject({
    method: 'GET',
    url:
      '/api/projects/project-1/agent/tasks?limit=1&order=priority&cursor=' +
      cursor,
  });
  assert.equal(next.statusCode, 200);
  assert.equal(next.json().nextCursor, null);
  assert.deepEqual(calls, [
    { limit: 1, order: 'priority' },
    { limit: 1, cursor, order: 'priority' },
  ]);

  const badOrder = await app.inject({
    method: 'GET',
    url: '/api/projects/project-1/agent/tasks?order=unknown',
  });
  assert.equal(badOrder.statusCode, 400);
});

test('archive route returns canonical metadata and guards conflicts', async (t) => {
  const calls: string[] = [];
  const app = Fastify();
  registerApiErrorHandling(app);
  app.register(agentRuntimeRoutes, {
    prefix: '/api',
    agentRuntimeRealtimeService: realtimeService(),
    agentRuntimeApiService: service({
      archiveTask: async (projectId, taskId) => {
        calls.push(projectId + ':' + taskId);
        if (taskId === 'running') {
          throw new AgentRuntimeApiServiceError(
            'AGENT_API_EXECUTION_CONFLICT',
            'Agent task is still active.',
          );
        }
        return {
          ...task,
          task: {
            ...task.task,
            state: 'completed',
            archivedAt: '2026-10-22T12:00:00.000Z',
          },
        };
      },
    }),
  });
  t.after(() => app.close());

  const archived = await app.inject({
    method: 'POST',
    url: '/api/projects/project-1/agent/tasks/task-1/archive',
  });
  assert.equal(archived.statusCode, 200);
  assert.equal(
    archived.json().task.task.archivedAt,
    '2026-10-22T12:00:00.000Z',
  );

  const active = await app.inject({
    method: 'POST',
    url: '/api/projects/project-1/agent/tasks/running/archive',
  });
  assert.equal(active.statusCode, 409);
  assert.deepEqual(calls, ['project-1:task-1', 'project-1:running']);
});

test('priority list forwards archived visibility query', async (t) => {
  const observed: boolean[] = [];
  const app = Fastify();
  registerApiErrorHandling(app);
  app.register(agentRuntimeRoutes, {
    prefix: '/api',
    agentRuntimeRealtimeService: realtimeService(),
    agentRuntimeApiService: service({
      listTasksPage: async (_projectId, options) => {
        observed.push(options.includeArchived ?? false);
        return { tasks: [], nextCursor: null };
      },
    }),
  });
  t.after(() => app.close());
  for (const enabled of ['false', 'true']) {
    const response = await app.inject({
      method: 'GET',
      url:
        '/api/projects/project-1/agent/tasks?order=priority&includeArchived=' +
        enabled,
    });
    assert.equal(response.statusCode, 200);
  }
  assert.deepEqual(observed, [false, true]);
  const invalid = await app.inject({
    method: 'GET',
    url: '/api/projects/project-1/agent/tasks?includeArchived=true',
  });
  assert.equal(invalid.statusCode, 400);
});
