import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';
import type { WebSocket } from 'ws';

import type {
  AgentCapability,
  AgentProviderId,
} from '@dev-dashboard/agent-runtime';

import { ApiError } from '../http/api-error.js';
import { commonErrorResponseSchemas } from '../http/response-schemas.js';
import {
  AgentRuntimeApiServiceError,
  type AgentRuntimeApiServicePort,
} from '../services/agent-runtime-api-service.js';
import type { AgentRuntimeRealtimeService } from '../services/agent-runtime-realtime-service.js';

interface Options extends FastifyPluginOptions {
  agentRuntimeApiService: AgentRuntimeApiServicePort;
  agentRuntimeRealtimeService: Pick<AgentRuntimeRealtimeService, 'attach'>;
}

interface ProjectParams {
  projectId: string;
}

interface TaskParams extends ProjectParams {
  taskId: string;
}

interface CheckpointParams extends TaskParams {
  checkpointId: string;
}

interface CreateTaskBody {
  summary: string;
  environmentInstanceId?: string;
  taskContextId?: string;
  requestedCapabilities?: AgentCapability[];
}

interface ExecuteBody {
  providerId?: AgentProviderId;
}

interface AuthorizationBody {
  capability: AgentCapability;
  granted: boolean;
}

interface BudgetBody {
  maxTotalTokens?: number;
  maxEstimatedCostUsd?: number;
}

interface CheckpointResolutionBody {
  decision: 'approved' | 'rejected';
  instruction?: string;
}

const providerIds = [
  'automatic',
  'codex',
  'claude-code',
  'chatgpt-browser',
] as const;
const concreteProviderIds = [
  'codex',
  'claude-code',
  'chatgpt-browser',
] as const;
const capabilities = [
  'workspace:write',
  'git:commit',
  'git:push',
  'github:pull-request',
  'github:merge',
  'deployment:run',
  'release:run',
] as const;
const taskStates = [
  'queued',
  'running',
  'checkpoint',
  'review',
  'blocked',
  'failed',
  'completed',
  'cancelled',
] as const;

const projectParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId'],
  properties: {
    projectId: { type: 'string', minLength: 1, maxLength: 256 },
  },
} as const;

const checkpointParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId', 'taskId', 'checkpointId'],
  properties: {
    projectId: { type: 'string', minLength: 1, maxLength: 256 },
    taskId: { type: 'string', minLength: 1, maxLength: 256 },
    checkpointId: { type: 'string', minLength: 1, maxLength: 256 },
  },
} as const;

const taskParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId', 'taskId'],
  properties: {
    projectId: { type: 'string', minLength: 1, maxLength: 256 },
    taskId: { type: 'string', minLength: 1, maxLength: 256 },
  },
} as const;

const createTaskBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['summary'],
  properties: {
    summary: { type: 'string', minLength: 1, maxLength: 4000 },
    environmentInstanceId: { type: 'string', minLength: 1, maxLength: 512 },
    taskContextId: { type: 'string', minLength: 1, maxLength: 256 },
    requestedCapabilities: {
      type: 'array',
      uniqueItems: true,
      maxItems: capabilities.length,
      items: { type: 'string', enum: [...capabilities] },
    },
  },
} as const;

const executeBodySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    providerId: { type: 'string', enum: [...providerIds] },
  },
} as const;

const budgetBodySchema = {
  type: 'object',
  additionalProperties: false,
  minProperties: 1,
  properties: {
    maxTotalTokens: { type: 'integer', minimum: 1 },
    maxEstimatedCostUsd: { type: 'number', exclusiveMinimum: 0 },
  },
} as const;

const authorizationBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['capability', 'granted'],
  properties: {
    capability: { type: 'string', enum: [...capabilities] },
    granted: { type: 'boolean' },
  },
} as const;

const checkpointResolutionBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['decision'],
  properties: {
    decision: { type: 'string', enum: ['approved', 'rejected'] },
    instruction: { type: 'string', minLength: 1, maxLength: 4000 },
  },
} as const;

const checkpointSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'taskId',
    'status',
    'summary',
    'requiredCapabilities',
    'createdAt',
  ],
  properties: {
    id: { type: 'string' },
    taskId: { type: 'string' },
    executionId: { type: 'string' },
    status: {
      type: 'string',
      enum: ['pending', 'approved', 'rejected'],
    },
    summary: { type: 'string' },
    requiredCapabilities: {
      type: 'array',
      items: { type: 'string', enum: [...capabilities] },
    },
    createdAt: { type: 'string' },
    resolvedAt: { type: 'string' },
    continuationInstruction: { type: 'string' },
  },
} as const;

const authorizationSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['taskId', 'capability', 'granted', 'observedAt'],
  properties: {
    taskId: { type: 'string' },
    capability: { type: 'string', enum: [...capabilities] },
    granted: { type: 'boolean' },
    observedAt: { type: 'string' },
  },
} as const;

const eventSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'taskId', 'type', 'summary', 'occurredAt'],
  properties: {
    id: { type: 'string' },
    taskId: { type: 'string' },
    executionId: { type: 'string' },
    providerId: {
      type: 'string',
      enum: ['codex', 'claude-code', 'chatgpt-browser'],
    },
    type: {
      type: 'string',
      enum: [
        'task-state',
        'execution-state',
        'checkpoint',
        'authorization',
        'evidence',
      ],
    },
    summary: { type: 'string' },
    occurredAt: { type: 'string' },
  },
} as const;

const evidenceSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'taskId', 'kind', 'summary', 'observedAt'],
  properties: {
    id: { type: 'string' },
    taskId: { type: 'string' },
    executionId: { type: 'string' },
    kind: {
      type: 'string',
      enum: [
        'diff',
        'test',
        'log',
        'commit',
        'pull-request',
        'readiness',
        'other',
      ],
    },
    summary: { type: 'string' },
    reference: { type: 'string' },
    observedAt: { type: 'string' },
  },
} as const;

const taskSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'projectId',
    'environmentInstanceId',
    'state',
    'summary',
    'requestedCapabilities',
    'createdAt',
    'updatedAt',
  ],
  properties: {
    id: { type: 'string' },
    projectId: { type: 'string' },
    environmentInstanceId: { type: 'string' },
    taskContextId: { type: 'string' },
    state: { type: 'string', enum: [...taskStates] },
    summary: { type: 'string' },
    continuationInstruction: { type: 'string' },
    requestedCapabilities: {
      type: 'array',
      items: { type: 'string', enum: [...capabilities] },
    },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
  },
} as const;

const taskRecordSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['task', 'version'],
  properties: {
    task: taskSchema,
    version: { type: 'integer', minimum: 1 },
  },
} as const;

const usageSummarySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['executionCount'],
  properties: {
    executionCount: { type: 'integer', minimum: 0 },
    inputTokens: { type: 'integer', minimum: 0 },
    cachedInputTokens: { type: 'integer', minimum: 0 },
    cacheWriteInputTokens: { type: 'integer', minimum: 0 },
    outputTokens: { type: 'integer', minimum: 0 },
    reasoningTokens: { type: 'integer', minimum: 0 },
    totalTokens: { type: 'integer', minimum: 0 },
    reportedCostUsd: { type: 'number', minimum: 0 },
    estimatedCostUsd: { type: 'number', minimum: 0 },
    durationMs: { type: 'integer', minimum: 0 },
  },
} as const;

const usageOverviewSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['total', 'byProvider'],
  properties: {
    total: usageSummarySchema,
    byProvider: {
      type: 'object',
      additionalProperties: false,
      properties: Object.fromEntries(
        concreteProviderIds.map((providerId) => [
          providerId,
          usageSummarySchema,
        ]),
      ),
    },
  },
} as const;

const budgetSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId', 'taskId', 'updatedAt'],
  properties: {
    projectId: { type: 'string' },
    taskId: { type: 'string' },
    maxTotalTokens: { type: 'integer', minimum: 1 },
    maxEstimatedCostUsd: { type: 'number', exclusiveMinimum: 0 },
    updatedAt: { type: 'string' },
  },
} as const;

const budgetAlertSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'observed', 'threshold'],
  properties: {
    kind: {
      type: 'string',
      enum: ['total-tokens', 'estimated-cost-usd'],
    },
    observed: { type: 'number', minimum: 0 },
    threshold: { type: 'number', exclusiveMinimum: 0 },
  },
} as const;

const budgetOverviewSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['budget', 'usage', 'alerts'],
  properties: {
    budget: {
      anyOf: [budgetSchema, { type: 'null' }],
    },
    usage: usageSummarySchema,
    alerts: {
      type: 'array',
      maxItems: 2,
      items: budgetAlertSchema,
    },
  },
} as const;

const providerStatusSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['providerId', 'availability', 'observedAt'],
  properties: {
    providerId: { type: 'string', enum: [...providerIds] },
    availability: {
      type: 'string',
      enum: ['available', 'degraded', 'unavailable'],
    },
    observedAt: { type: 'string' },
    version: { type: 'string' },
    reason: { type: 'string' },
  },
} as const;

const runtimeStateSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'taskId',
    'projectId',
    'canonicalVersion',
    'state',
    'attempts',
    'updatedAt',
  ],
  properties: {
    taskId: { type: 'string' },
    projectId: { type: 'string' },
    canonicalVersion: { type: 'integer', minimum: 0 },
    state: { type: 'string', enum: ['idle', 'running', 'interrupted'] },
    executionId: { type: 'string' },
    processId: { type: 'integer', minimum: 1 },
    attempts: { type: 'integer', minimum: 0 },
    startedAt: { type: 'string' },
    updatedAt: { type: 'string' },
    lastReason: {
      type: 'string',
      enum: [
        'process-interrupted',
        'canonical-task-advanced',
        'operator-recovered',
      ],
    },
  },
} as const;

const ownershipSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId', 'taskId', 'executionId'],
  properties: {
    projectId: { type: 'string' },
    taskId: { type: 'string' },
    executionId: { type: 'string' },
    environmentInstanceId: { type: 'string' },
  },
} as const;

const statusSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['task', 'runtime'],
  properties: {
    task: taskRecordSchema,
    runtime: runtimeStateSchema,
    activeExecution: ownershipSchema,
  },
} as const;

const failureSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'code', 'message'],
  properties: {
    kind: { type: 'string', enum: ['known', 'ambiguous'] },
    code: { type: 'string' },
    message: { type: 'string' },
  },
} as const;

const executionSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'taskId', 'projectId', 'providerId', 'state'],
  properties: {
    id: { type: 'string' },
    taskId: { type: 'string' },
    projectId: { type: 'string' },
    environmentInstanceId: { type: 'string' },
    requestedProviderId: { type: 'string', enum: [...providerIds] },
    providerId: {
      type: 'string',
      enum: ['codex', 'claude-code', 'chatgpt-browser'],
    },
    state: {
      type: 'string',
      enum: [
        'queued',
        'running',
        'checkpoint',
        'succeeded',
        'failed',
        'cancelled',
        'unknown',
      ],
    },
    startedAt: { type: 'string' },
    finishedAt: { type: 'string' },
    failure: failureSchema,
  },
} as const;

const providerResultSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['providerId', 'outcome', 'summary'],
  properties: {
    providerId: {
      type: 'string',
      enum: ['codex', 'claude-code', 'chatgpt-browser'],
    },
    outcome: {
      type: 'string',
      enum: ['checkpoint', 'succeeded', 'failed', 'cancelled', 'unknown'],
    },
    summary: { type: 'string' },
    failure: failureSchema,
    evidence: {
      type: 'array',
      maxItems: 100,
      items: evidenceSchema,
    },
  },
} as const;

function mapAgentError(error: unknown): unknown {
  if (!(error instanceof AgentRuntimeApiServiceError)) return error;

  switch (error.code) {
    case 'AGENT_API_PROJECT_NOT_FOUND':
      return new ApiError({
        statusCode: 404,
        code: 'PROJECT_NOT_FOUND',
        message: error.message,
      });
    case 'AGENT_API_ENVIRONMENT_NOT_FOUND':
      return new ApiError({
        statusCode: 404,
        code: 'ENVIRONMENT_INSTANCE_NOT_FOUND',
        message: error.message,
      });
    case 'AGENT_API_TASK_CONTEXT_NOT_FOUND':
      return new ApiError({
        statusCode: 404,
        code: 'NOT_FOUND',
        message: error.message,
      });
    case 'AGENT_API_TASK_NOT_FOUND':
    case 'AGENT_WORKFLOW_TASK_NOT_FOUND':
    case 'AGENT_WORKFLOW_TASK_PROJECT_MISMATCH':
      return new ApiError({
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'Agent task was not found.',
      });
    case 'AGENT_API_INVALID_REQUEST':
    case 'AGENT_WORKFLOW_PROVIDER_NOT_FOUND':
    case 'AGENT_WORKFLOW_AUTHORIZATION_INVALID':
    case 'AGENT_WORKFLOW_CHECKPOINT_INVALID':
      return new ApiError({
        statusCode: 400,
        code: 'BAD_REQUEST',
        message: error.message,
      });
    case 'AGENT_WORKFLOW_PROVIDER_FAILED':
      return new ApiError({
        statusCode: 502,
        code: 'INTERNAL_ERROR',
        message: error.message,
      });
    case 'AGENT_WORKFLOW_CLOSING':
      return new ApiError({
        statusCode: 503,
        code: 'INTERNAL_ERROR',
        message: error.message,
      });
    case 'AGENT_WORKFLOW_TASK_NOT_RUNNABLE':
    case 'AGENT_WORKFLOW_CANCEL_NOT_ACTIVE':
    case 'AGENT_WORKFLOW_CANCEL_OWNERSHIP_MISMATCH':
    case 'AGENT_WORKFLOW_RETRY_NOT_ALLOWED':
    case 'AGENT_WORKFLOW_CHECKPOINT_NOT_PENDING':
      return new ApiError({
        statusCode: 409,
        code: 'CONFLICT',
        message: error.message,
      });
  }

  return error;
}

async function withAgentErrors<T>(operation: () => Promise<T> | T): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw mapAgentError(error);
  }
}

function sendJson(socket: WebSocket, message: unknown): void {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

export const agentRuntimeRoutes: FastifyPluginAsync<Options> = async (
  app,
  options,
) => {
  app.get(
    '/agent/providers',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['providers'],
            properties: {
              providers: { type: 'array', items: providerStatusSchema },
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async () =>
      withAgentErrors(async () => ({
        providers: await options.agentRuntimeApiService.listProviders(),
      })),
  );

  app.get<{ Params: ProjectParams }>(
    '/projects/:projectId/agent/tasks',
    {
      schema: {
        params: projectParamsSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['tasks'],
            properties: {
              tasks: { type: 'array', items: taskRecordSchema },
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) =>
      withAgentErrors(async () => ({
        tasks: await options.agentRuntimeApiService.listTasks(
          request.params.projectId,
        ),
      })),
  );

  app.post<{ Params: ProjectParams; Body: CreateTaskBody }>(
    '/projects/:projectId/agent/tasks',
    {
      schema: {
        params: projectParamsSchema,
        body: createTaskBodySchema,
        response: {
          201: {
            type: 'object',
            additionalProperties: false,
            required: ['task'],
            properties: { task: taskRecordSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      const task = await withAgentErrors(() =>
        options.agentRuntimeApiService.createTask(
          request.params.projectId,
          request.body,
        ),
      );
      return reply.code(201).send({ task });
    },
  );

  app.get<{ Params: TaskParams }>(
    '/projects/:projectId/agent/tasks/:taskId',
    {
      schema: {
        params: taskParamsSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['task'],
            properties: { task: taskRecordSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) =>
      withAgentErrors(async () => ({
        task: await options.agentRuntimeApiService.getTask(
          request.params.projectId,
          request.params.taskId,
        ),
      })),
  );

  app.get<{ Params: TaskParams }>(
    '/projects/:projectId/agent/tasks/:taskId/status',
    {
      schema: {
        params: taskParamsSchema,
        response: {
          200: statusSchema,
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) =>
      withAgentErrors(() =>
        options.agentRuntimeApiService.status(
          request.params.projectId,
          request.params.taskId,
        ),
      ),
  );

  app.post<{ Params: TaskParams; Body: ExecuteBody }>(
    '/projects/:projectId/agent/tasks/:taskId/executions',
    {
      schema: {
        params: taskParamsSchema,
        body: executeBodySchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['execution', 'task', 'providerResult'],
            properties: {
              execution: executionSchema,
              task: taskRecordSchema,
              providerResult: providerResultSchema,
              checkpoint: checkpointSchema,
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) =>
      withAgentErrors(() =>
        options.agentRuntimeApiService.execute(
          request.params.projectId,
          request.params.taskId,
          request.body?.providerId,
        ),
      ),
  );

  app.get<{ Params: ProjectParams }>(
    '/projects/:projectId/agent/usage',
    {
      schema: {
        params: projectParamsSchema,
        response: {
          200: usageOverviewSchema,
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) =>
      withAgentErrors(() =>
        options.agentRuntimeApiService.usage(request.params.projectId),
      ),
  );

  app.get<{ Params: TaskParams }>(
    '/projects/:projectId/agent/tasks/:taskId/usage',
    {
      schema: {
        params: taskParamsSchema,
        response: {
          200: usageOverviewSchema,
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) =>
      withAgentErrors(() =>
        options.agentRuntimeApiService.usage(
          request.params.projectId,
          request.params.taskId,
        ),
      ),
  );

  app.get<{ Params: TaskParams }>(
    '/projects/:projectId/agent/tasks/:taskId/budget',
    {
      schema: {
        params: taskParamsSchema,
        response: {
          200: budgetOverviewSchema,
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) =>
      withAgentErrors(() =>
        options.agentRuntimeApiService.budget(
          request.params.projectId,
          request.params.taskId,
        ),
      ),
  );

  app.put<{ Params: TaskParams; Body: BudgetBody }>(
    '/projects/:projectId/agent/tasks/:taskId/budget',
    {
      schema: {
        params: taskParamsSchema,
        body: budgetBodySchema,
        response: {
          200: budgetOverviewSchema,
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) =>
      withAgentErrors(() =>
        options.agentRuntimeApiService.setBudget(
          request.params.projectId,
          request.params.taskId,
          request.body,
        ),
      ),
  );

  app.delete<{ Params: TaskParams }>(
    '/projects/:projectId/agent/tasks/:taskId/budget',
    {
      schema: {
        params: taskParamsSchema,
        response: {
          200: budgetOverviewSchema,
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) =>
      withAgentErrors(() =>
        options.agentRuntimeApiService.clearBudget(
          request.params.projectId,
          request.params.taskId,
        ),
      ),
  );

  app.post<{ Params: TaskParams }>(
    '/projects/:projectId/agent/tasks/:taskId/cancel',
    {
      schema: {
        params: taskParamsSchema,
        response: {
          200: statusSchema,
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) =>
      withAgentErrors(() =>
        options.agentRuntimeApiService.cancel(
          request.params.projectId,
          request.params.taskId,
        ),
      ),
  );

  app.get<{ Params: TaskParams }>(
    '/projects/:projectId/agent/tasks/:taskId/activity',
    {
      schema: {
        params: taskParamsSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['authorizations', 'checkpoints', 'events', 'evidence'],
            properties: {
              authorizations: {
                type: 'array',
                maxItems: capabilities.length,
                items: authorizationSchema,
              },
              checkpoints: {
                type: 'array',
                maxItems: 200,
                items: checkpointSchema,
              },
              events: {
                type: 'array',
                maxItems: 200,
                items: eventSchema,
              },
              evidence: {
                type: 'array',
                maxItems: 100,
                items: evidenceSchema,
              },
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) =>
      withAgentErrors(() =>
        options.agentRuntimeApiService.activity(
          request.params.projectId,
          request.params.taskId,
        ),
      ),
  );

  app.post<{ Params: TaskParams; Body: AuthorizationBody }>(
    '/projects/:projectId/agent/tasks/:taskId/authorizations',
    {
      schema: {
        params: taskParamsSchema,
        body: authorizationBodySchema,
        response: {
          200: authorizationSchema,
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) =>
      withAgentErrors(() =>
        options.agentRuntimeApiService.setAuthorization(
          request.params.projectId,
          request.params.taskId,
          request.body.capability,
          request.body.granted,
        ),
      ),
  );

  app.post<{
    Params: CheckpointParams;
    Body: CheckpointResolutionBody;
  }>(
    '/projects/:projectId/agent/tasks/:taskId/checkpoints/:checkpointId/resolve',
    {
      schema: {
        params: checkpointParamsSchema,
        body: checkpointResolutionBodySchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['task', 'checkpoint'],
            properties: {
              task: taskRecordSchema,
              checkpoint: checkpointSchema,
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) =>
      withAgentErrors(() =>
        options.agentRuntimeApiService.resolveCheckpoint(
          request.params.projectId,
          request.params.taskId,
          request.params.checkpointId,
          request.body.decision,
          request.body.instruction,
        ),
      ),
  );

  app.post<{ Params: TaskParams }>(
    '/projects/:projectId/agent/tasks/:taskId/retry',
    {
      schema: {
        params: taskParamsSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['task'],
            properties: { task: taskRecordSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) =>
      withAgentErrors(async () => ({
        task: await options.agentRuntimeApiService.retry(
          request.params.projectId,
          request.params.taskId,
        ),
      })),
  );

  app.post<{ Params: TaskParams }>(
    '/projects/:projectId/agent/tasks/:taskId/recover',
    {
      schema: {
        params: taskParamsSchema,
        response: {
          200: statusSchema,
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) =>
      withAgentErrors(() =>
        options.agentRuntimeApiService.recover(
          request.params.projectId,
          request.params.taskId,
        ),
      ),
  );

  app.get<{ Params: TaskParams }>(
    '/projects/:projectId/agent/tasks/:taskId/connect',
    {
      websocket: true,
      schema: { params: taskParamsSchema },
    },
    (socket, request) => {
      let detached = false;
      const detach = () => {
        detached = true;
      };

      void options.agentRuntimeRealtimeService
        .attach(
          request.params.projectId,
          request.params.taskId,
          (snapshot) => {
            if (!detached) sendJson(socket, { type: 'update', snapshot });
          },
          () => {
            if (detached) return;
            sendJson(socket, {
              type: 'error',
              message: 'Agent realtime status is unavailable.',
            });
            socket.close(1011, 'Agent realtime unavailable');
          },
        )
        .then((attachment) => {
          if (detached) {
            attachment.detach();
            return;
          }

          sendJson(socket, { type: 'ready', snapshot: attachment.snapshot });
          const close = () => {
            detached = true;
            attachment.detach();
          };
          socket.once('close', close);
          socket.once('error', close);
        })
        .catch(() => {
          if (detached) return;
          sendJson(socket, {
            type: 'error',
            message: 'Agent task is unavailable.',
          });
          socket.close(1008, 'Agent task unavailable');
        });

      socket.once('close', detach);
      socket.once('error', detach);
    },
  );
};
