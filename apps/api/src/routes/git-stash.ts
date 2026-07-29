import type {
  FastifyPluginAsync,
  FastifyPluginOptions,
} from 'fastify';

import type {
  GitStashCreateInput,
  GitStashOperation,
} from '@dev-dashboard/contracts';

import { ApiError, type ApiErrorCode } from '../http/api-error.js';
import { commonErrorResponseSchemas } from '../http/response-schemas.js';
import {
  GitStashError,
  GitStashService,
} from '../services/git-stash-service.js';
import type { ProjectStore } from '../store/project-store.js';

interface GitStashRouteOptions extends FastifyPluginOptions {
  projectStore: ProjectStore;
}

interface ProjectParams {
  projectId: string;
}

interface StashParams extends ProjectParams {
  stashReference: string;
}

const projectParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId'],
  properties: { projectId: { type: 'string', minLength: 1 } },
} as const;

const stashParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId', 'stashReference'],
  properties: {
    projectId: { type: 'string', minLength: 1 },
    stashReference: {
      type: 'string',
      minLength: 9,
      maxLength: 32,
      pattern: '^stash@\\{[0-9]+\\}$',
    },
  },
} as const;

const operationSchema = {
  type: 'string',
  enum: ['create', 'apply', 'pop', 'drop'],
} as const;

const confirmationBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['operation', 'target'],
  properties: {
    operation: operationSchema,
    target: { type: 'string', minLength: 1, maxLength: 200 },
  },
} as const;

const confirmationSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['token', 'operation', 'target', 'expiresAt'],
  properties: {
    token: { type: 'string' },
    operation: operationSchema,
    target: { type: 'string' },
    expiresAt: { type: 'string' },
  },
} as const;

const createBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['message', 'includeUntracked', 'keepIndex', 'confirmationToken'],
  properties: {
    message: { type: 'string', maxLength: 200 },
    includeUntracked: { type: 'boolean' },
    keepIndex: { type: 'boolean' },
    confirmationToken: { type: 'string', minLength: 64, maxLength: 64 },
  },
} as const;

const mutationBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['confirmationToken'],
  properties: {
    confirmationToken: { type: 'string', minLength: 64, maxLength: 64 },
  },
} as const;

const stashSummarySchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'index',
    'reference',
    'hash',
    'message',
    'branch',
    'createdAt',
    'fileCount',
    'additions',
    'deletions',
    'includesUntracked',
  ],
  properties: {
    index: { type: 'integer', minimum: 0 },
    reference: { type: 'string' },
    hash: { type: 'string' },
    message: { type: 'string' },
    branch: { type: 'string' },
    createdAt: { type: 'string' },
    fileCount: { type: 'integer', minimum: 0 },
    additions: { type: 'integer', minimum: 0 },
    deletions: { type: 'integer', minimum: 0 },
    includesUntracked: { type: 'boolean' },
  },
} as const;

const stashFileSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['path', 'status', 'additions', 'deletions', 'binary'],
  properties: {
    path: { type: 'string' },
    previousPath: { type: 'string' },
    status: {
      type: 'string',
      enum: [
        'added',
        'modified',
        'deleted',
        'renamed',
        'copied',
        'untracked',
        'conflicted',
        'type-changed',
      ],
    },
    additions: { type: 'integer', minimum: 0 },
    deletions: { type: 'integer', minimum: 0 },
    binary: { type: 'boolean' },
  },
} as const;

const stashDetailSchema = {
  ...stashSummarySchema,
  required: [
    ...stashSummarySchema.required,
    'files',
    'patch',
    'truncated',
    'masked',
    'redactionCount',
  ],
  properties: {
    ...stashSummarySchema.properties,
    files: { type: 'array', items: stashFileSchema },
    patch: { type: 'string' },
    truncated: { type: 'boolean' },
    masked: { type: 'boolean' },
    redactionCount: { type: 'integer', minimum: 0 },
  },
} as const;

const mutationResultSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['stash', 'applied', 'removed'],
  properties: {
    stash: stashSummarySchema,
    applied: { type: 'boolean' },
    removed: { type: 'boolean' },
  },
} as const;

function translateStashError(error: unknown): never {
  if (error instanceof GitStashError) {
    const statusByCode: Record<GitStashError['code'], number> = {
      GIT_NOT_REPOSITORY: 400,
      GIT_WORKING_TREE_DIRTY: 409,
      GIT_NOTHING_TO_STASH: 409,
      GIT_STASH_REFERENCE_INVALID: 400,
      GIT_STASH_NOT_FOUND: 404,
      GIT_STASH_CONFIRMATION_REQUIRED: 409,
      GIT_STASH_PUSH_FAILED: 500,
      GIT_STASH_APPLY_FAILED: 500,
      GIT_STASH_POP_FAILED: 500,
      GIT_STASH_DROP_FAILED: 500,
      GIT_STASH_CONFLICT: 409,
    };
    const apiCodeByCode: Record<GitStashError['code'], ApiErrorCode> = {
      GIT_NOT_REPOSITORY: 'GIT_NOT_REPOSITORY',
      GIT_WORKING_TREE_DIRTY: 'GIT_WORKING_TREE_DIRTY',
      GIT_NOTHING_TO_STASH: 'GIT_NOTHING_TO_STASH',
      GIT_STASH_REFERENCE_INVALID: 'GIT_STASH_REFERENCE_INVALID',
      GIT_STASH_NOT_FOUND: 'GIT_STASH_NOT_FOUND',
      GIT_STASH_CONFIRMATION_REQUIRED: 'GIT_STASH_CONFIRMATION_REQUIRED',
      GIT_STASH_PUSH_FAILED: 'GIT_STASH_PUSH_FAILED',
      GIT_STASH_APPLY_FAILED: 'GIT_STASH_APPLY_FAILED',
      GIT_STASH_POP_FAILED: 'GIT_STASH_POP_FAILED',
      GIT_STASH_DROP_FAILED: 'GIT_STASH_DROP_FAILED',
      GIT_STASH_CONFLICT: 'GIT_STASH_CONFLICT',
    };
    throw new ApiError({
      statusCode: statusByCode[error.code],
      code: apiCodeByCode[error.code],
      message: error.message,
    });
  }

  throw new ApiError({
    statusCode: 500,
    code: 'GIT_COMMAND_FAILED',
    message: error instanceof Error
      ? error.message
      : 'Não foi possível concluir a operação de stash.',
  });
}

export const gitStashRoutes: FastifyPluginAsync<GitStashRouteOptions> = async (
  app,
  options,
) => {
  const service = new GitStashService();

  function projectFor(projectId: string) {
    const project = options.projectStore.findProject(projectId);
    if (!project) {
      throw new ApiError({
        statusCode: 404,
        code: 'PROJECT_NOT_FOUND',
        message: 'Projeto não encontrado.',
      });
    }
    return project;
  }

  app.get<{ Params: ProjectParams }>(
    '/projects/:projectId/git/stashes',
    {
      schema: {
        params: projectParamsSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['stashes'],
            properties: {
              stashes: { type: 'array', items: stashSummarySchema },
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = projectFor(request.params.projectId);
      try {
        return { stashes: await service.list(project.path) };
      } catch (error) {
        translateStashError(error);
      }
    },
  );

  app.get<{ Params: StashParams }>(
    '/projects/:projectId/git/stashes/:stashReference',
    {
      schema: {
        params: stashParamsSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['detail'],
            properties: { detail: stashDetailSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = projectFor(request.params.projectId);
      try {
        return {
          detail: await service.inspect(
            project.path,
            request.params.stashReference,
          ),
        };
      } catch (error) {
        translateStashError(error);
      }
    },
  );

  app.post<{
    Params: ProjectParams;
    Body: { operation: GitStashOperation; target: string };
  }>(
    '/projects/:projectId/git/stashes/confirmations',
    {
      schema: {
        params: projectParamsSchema,
        body: confirmationBodySchema,
        response: {
          201: {
            type: 'object',
            additionalProperties: false,
            required: ['confirmation'],
            properties: { confirmation: confirmationSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      const project = projectFor(request.params.projectId);
      try {
        return reply.code(201).send({
          confirmation: service.prepareConfirmation(
            project.id,
            request.body.operation,
            request.body.target,
          ),
        });
      } catch (error) {
        translateStashError(error);
      }
    },
  );

  app.post<{
    Params: ProjectParams;
    Body: GitStashCreateInput & { confirmationToken: string };
  }>(
    '/projects/:projectId/git/stashes',
    {
      schema: {
        params: projectParamsSchema,
        body: createBodySchema,
        response: {
          201: {
            type: 'object',
            additionalProperties: false,
            required: ['result'],
            properties: { result: mutationResultSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      const project = projectFor(request.params.projectId);
      try {
        return reply.code(201).send({
          result: await service.create(
            project.path,
            project.id,
            {
              message: request.body.message,
              includeUntracked: request.body.includeUntracked,
              keepIndex: request.body.keepIndex,
            },
            request.body.confirmationToken,
          ),
        });
      } catch (error) {
        translateStashError(error);
      }
    },
  );

  for (const operation of ['apply', 'pop', 'drop'] as const) {
    app.post<{
      Params: StashParams;
      Body: { confirmationToken: string };
    }>(
      `/projects/:projectId/git/stashes/:stashReference/${operation}`,
      {
        schema: {
          params: stashParamsSchema,
          body: mutationBodySchema,
          response: {
            200: {
              type: 'object',
              additionalProperties: false,
              required: ['result'],
              properties: { result: mutationResultSchema },
            },
            ...commonErrorResponseSchemas,
          },
        },
      },
      async (request) => {
        const project = projectFor(request.params.projectId);
        try {
          return {
            result: await service[operation](
              project.path,
              project.id,
              request.params.stashReference,
              request.body.confirmationToken,
            ),
          };
        } catch (error) {
          translateStashError(error);
        }
      },
    );
  }
};
