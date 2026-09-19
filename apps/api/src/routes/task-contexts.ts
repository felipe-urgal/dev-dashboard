import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';

import type {
  TaskContext,
  TaskContextSnapshot,
} from '@dev-dashboard/contracts';

import { ApiError } from '../http/api-error.js';
import { commonErrorResponseSchemas } from '../http/response-schemas.js';
import {
  TaskContextServiceError,
  type TaskContextService,
} from '../services/task-context-service.js';

interface Options extends FastifyPluginOptions {
  taskContextService: Pick<
    TaskContextService,
    'list' | 'create' | 'snapshot' | 'updateReferences' | 'remove'
  >;
}

interface ProjectParams {
  projectId: string;
}

interface TaskContextParams extends ProjectParams {
  taskContextId: string;
}

interface TaskReference {
  repository: string;
  number: number;
}

interface CreateBody {
  environmentInstanceId?: string;
  issue?: TaskReference;
  pullRequest?: TaskReference;
}

interface UpdateBody {
  issue?: TaskReference | null;
  pullRequest?: TaskReference | null;
}

const projectParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId'],
  properties: {
    projectId: { type: 'string', minLength: 1 },
  },
} as const;

const taskContextParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId', 'taskContextId'],
  properties: {
    projectId: { type: 'string', minLength: 1 },
    taskContextId: { type: 'string', minLength: 1 },
  },
} as const;

const referenceSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['repository', 'number'],
  properties: {
    repository: {
      type: 'string',
      minLength: 1,
      maxLength: 256,
      pattern: '^[^\\r\\n]+$',
    },
    number: { type: 'integer', minimum: 1 },
  },
} as const;

const createBodySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    environmentInstanceId: { type: 'string', minLength: 1, maxLength: 256 },
    issue: referenceSchema,
    pullRequest: referenceSchema,
  },
} as const;

const nullableReferenceSchema = {
  anyOf: [referenceSchema, { type: 'null' }],
} as const;

const updateBodySchema = {
  type: 'object',
  additionalProperties: false,
  minProperties: 1,
  properties: {
    issue: nullableReferenceSchema,
    pullRequest: nullableReferenceSchema,
  },
} as const;

const taskContextReferenceResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['repository', 'number'],
  properties: {
    repository: { type: 'string' },
    number: { type: 'integer' },
  },
} as const;

const taskContextResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'projectId', 'branch', 'createdAt', 'updatedAt'],
  properties: {
    id: { type: 'string' },
    projectId: { type: 'string' },
    branch: { type: 'string' },
    environmentInstanceId: { type: 'string' },
    worktreeId: { type: 'string' },
    issue: taskContextReferenceResponseSchema,
    pullRequest: taskContextReferenceResponseSchema,
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
  },
} as const;

const readinessResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'observedAt'],
  properties: {
    status: {
      type: 'string',
      enum: ['pass', 'warning', 'block', 'unknown'],
    },
    observedAt: { type: 'string' },
  },
} as const;

const taskContextEvidenceResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['observedAt'],
  properties: {
    observedAt: { type: 'string' },
    currentBranch: { type: 'string' },
    branchMatches: { type: 'boolean' },
    headSha: { type: 'string' },
    pullRequestObservedAt: { type: 'string' },
    readiness: readinessResponseSchema,
  },
} as const;

const taskContextSnapshotResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['context'],
  properties: {
    context: taskContextResponseSchema,
    evidence: taskContextEvidenceResponseSchema,
  },
} as const;

function mapTaskContextError(error: unknown): unknown {
  if (!(error instanceof TaskContextServiceError)) return error;

  switch (error.code) {
    case 'TASK_CONTEXT_PROJECT_NOT_FOUND':
      return new ApiError({
        statusCode: 404,
        code: 'PROJECT_NOT_FOUND',
        message: error.message,
      });
    case 'TASK_CONTEXT_ENVIRONMENT_NOT_FOUND':
      return new ApiError({
        statusCode: 404,
        code: 'ENVIRONMENT_INSTANCE_NOT_FOUND',
        message: error.message,
      });
    case 'TASK_CONTEXT_NOT_FOUND':
      return new ApiError({
        statusCode: 404,
        code: 'NOT_FOUND',
        message: error.message,
      });
    case 'TASK_CONTEXT_GIT_BRANCH_UNAVAILABLE':
      return new ApiError({
        statusCode: 409,
        code: 'CONFLICT',
        message: error.message,
      });
  }
}

async function withTaskContextErrors<T>(
  operation: () => Promise<T> | T,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw mapTaskContextError(error);
  }
}

export const taskContextRoutes: FastifyPluginAsync<Options> = async (
  app,
  options,
) => {
  app.get<{ Params: ProjectParams }>(
    '/projects/:projectId/task-contexts',
    {
      schema: {
        params: projectParamsSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['contexts'],
            properties: {
              contexts: {
                type: 'array',
                items: taskContextResponseSchema,
              },
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) =>
      withTaskContextErrors(() => ({
        contexts: options.taskContextService.list(request.params.projectId),
      })),
  );

  app.post<{ Params: ProjectParams; Body: CreateBody }>(
    '/projects/:projectId/task-contexts',
    {
      schema: {
        params: projectParamsSchema,
        body: createBodySchema,
        response: {
          201: {
            type: 'object',
            additionalProperties: false,
            required: ['context'],
            properties: { context: taskContextResponseSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      const context = await withTaskContextErrors(() =>
        options.taskContextService.create(
          request.params.projectId,
          request.body ?? {},
        ),
      );
      reply.code(201);
      return { context };
    },
  );

  app.get<{ Params: TaskContextParams }>(
    '/projects/:projectId/task-contexts/:taskContextId',
    {
      schema: {
        params: taskContextParamsSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['snapshot'],
            properties: {
              snapshot: taskContextSnapshotResponseSchema,
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) =>
      withTaskContextErrors(async () => ({
        snapshot: await options.taskContextService.snapshot(
          request.params.projectId,
          request.params.taskContextId,
        ),
      })),
  );

  app.patch<{ Params: TaskContextParams; Body: UpdateBody }>(
    '/projects/:projectId/task-contexts/:taskContextId',
    {
      schema: {
        params: taskContextParamsSchema,
        body: updateBodySchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['context'],
            properties: { context: taskContextResponseSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) =>
      withTaskContextErrors(async () => ({
        context: await options.taskContextService.updateReferences(
          request.params.projectId,
          request.params.taskContextId,
          request.body,
        ),
      })),
  );

  app.delete<{ Params: TaskContextParams }>(
    '/projects/:projectId/task-contexts/:taskContextId',
    {
      schema: {
        params: taskContextParamsSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['removed'],
            properties: { removed: { type: 'boolean' } },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) =>
      withTaskContextErrors(async () => {
        await options.taskContextService.remove(
          request.params.projectId,
          request.params.taskContextId,
        );
        return { removed: true };
      }),
  );
};

export type {
  CreateBody as TaskContextCreateBody,
  UpdateBody as TaskContextUpdateBody,
};
