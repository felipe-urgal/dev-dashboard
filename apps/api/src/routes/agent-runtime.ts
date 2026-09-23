import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';

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

interface Options extends FastifyPluginOptions {
  agentRuntimeApiService: AgentRuntimeApiServicePort;
}

interface ProjectParams {
  projectId: string;
}

interface TaskParams extends ProjectParams {
  taskId: string;
}

interface CreateTaskBody {
  summary: string;
  environmentInstanceId?: string;
  requestedCapabilities?: AgentCapability[];
}

interface ExecuteBody {
  providerId?: AgentProviderId;
}

const providerIds = [
  'automatic',
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
    state: { type: 'string', enum: [...taskStates] },
    summary: { type: 'string' },
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
      enum: ['succeeded', 'failed', 'cancelled', 'unknown'],
    },
    summary: { type: 'string' },
    failure: failureSchema,
    evidence: {
      type: 'array',
      maxItems: 100,
      items: {
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
      },
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
    case 'AGENT_API_TASK_NOT_FOUND':
    case 'AGENT_WORKFLOW_TASK_NOT_FOUND':
    case 'AGENT_WORKFLOW_TASK_PROJECT_MISMATCH':
      return new ApiError({
        statusCode: 404,
        code: 'AGENT_TASK_NOT_FOUND',
        message: 'Agent task was not found.',
      });
    case 'AGENT_API_INVALID_REQUEST':
    case 'AGENT_WORKFLOW_PROVIDER_NOT_FOUND':
    case 'AGENT_WORKFLOW_AUTHORIZATION_INVALID':
      return new ApiError({
        statusCode: 400,
        code: 'AGENT_INVALID_REQUEST',
        message: error.message,
      });
    case 'AGENT_WORKFLOW_PROVIDER_FAILED':
      return new ApiError({
        statusCode: 502,
        code: 'AGENT_PROVIDER_FAILED',
        message: error.message,
      });
    case 'AGENT_WORKFLOW_CLOSING':
      return new ApiError({
        statusCode: 503,
        code: 'AGENT_RUNTIME_CLOSING',
        message: error.message,
      });
    case 'AGENT_WORKFLOW_TASK_NOT_RUNNABLE':
    case 'AGENT_WORKFLOW_CANCEL_NOT_ACTIVE':
    case 'AGENT_WORKFLOW_CANCEL_OWNERSHIP_MISMATCH':
    case 'AGENT_WORKFLOW_RETRY_NOT_ALLOWED':
      return new ApiError({
        statusCode: 409,
        code: 'AGENT_CONFLICT',
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
};
