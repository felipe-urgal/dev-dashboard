import type {
  FastifyPluginAsync,
  FastifyPluginOptions,
} from 'fastify';

import type { GitSyncStrategy } from '@dev-dashboard/contracts';

import { ApiError, type ApiErrorCode } from '../http/api-error.js';
import { commonErrorResponseSchemas } from '../http/response-schemas.js';
import {
  GitSyncError,
  GitSyncService,
} from '../services/git-sync-service.js';
import type { ProjectStore } from '../store/project-store.js';

interface GitSyncRouteOptions extends FastifyPluginOptions {
  projectStore: ProjectStore;
}

interface ProjectParams {
  projectId: string;
}

const projectParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId'],
  properties: {
    projectId: { type: 'string', minLength: 1 },
  },
} as const;

const strategySchema = {
  type: 'string',
  enum: ['ff-only', 'rebase', 'merge'],
} as const;

const compareQuerySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['reference'],
  properties: {
    reference: { type: 'string', minLength: 3, maxLength: 300 },
  },
} as const;

const confirmationBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['reference', 'strategy'],
  properties: {
    reference: { type: 'string', minLength: 3, maxLength: 300 },
    strategy: strategySchema,
  },
} as const;

const mutationBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['reference', 'strategy', 'confirmationToken'],
  properties: {
    reference: { type: 'string', minLength: 3, maxLength: 300 },
    strategy: strategySchema,
    confirmationToken: { type: 'string', minLength: 64, maxLength: 64 },
  },
} as const;

const comparisonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['reference', 'ahead', 'behind'],
  properties: {
    reference: { type: 'string' },
    ahead: { type: 'integer', minimum: 0 },
    behind: { type: 'integer', minimum: 0 },
  },
} as const;

const confirmationSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['token', 'reference', 'strategy', 'expiresAt'],
  properties: {
    token: { type: 'string' },
    reference: { type: 'string' },
    strategy: strategySchema,
    expiresAt: { type: 'string' },
  },
} as const;

const resultSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'branch',
    'reference',
    'strategy',
    'changed',
    'previousHead',
    'currentHead',
  ],
  properties: {
    branch: { type: 'string' },
    reference: { type: 'string' },
    strategy: strategySchema,
    changed: { type: 'boolean' },
    previousHead: { type: 'string' },
    currentHead: { type: 'string' },
  },
} as const;

function translateSyncError(error: unknown): never {
  if (error instanceof GitSyncError) {
    const statusByCode: Record<GitSyncError['code'], number> = {
      GIT_NOT_REPOSITORY: 400,
      GIT_REFERENCE_INVALID: 400,
      GIT_REFERENCE_NOT_FOUND: 404,
      GIT_WORKING_TREE_DIRTY: 409,
      GIT_SYNC_CONFIRMATION_REQUIRED: 409,
      GIT_DETACHED_HEAD: 400,
      GIT_SYNC_CONFLICT: 409,
      GIT_SYNC_DIVERGED: 409,
      GIT_SYNC_FAILED: 500,
    };
    const apiCodeByCode: Record<GitSyncError['code'], ApiErrorCode> = {
      GIT_NOT_REPOSITORY: 'GIT_NOT_REPOSITORY',
      GIT_REFERENCE_INVALID: 'GIT_REFERENCE_INVALID',
      GIT_REFERENCE_NOT_FOUND: 'GIT_REFERENCE_NOT_FOUND',
      GIT_WORKING_TREE_DIRTY: 'GIT_WORKING_TREE_DIRTY',
      GIT_SYNC_CONFIRMATION_REQUIRED: 'GIT_SYNC_CONFIRMATION_REQUIRED',
      GIT_DETACHED_HEAD: 'GIT_DETACHED_HEAD',
      GIT_SYNC_CONFLICT: 'GIT_SYNC_CONFLICT',
      GIT_SYNC_DIVERGED: 'GIT_SYNC_DIVERGED',
      GIT_SYNC_FAILED: 'GIT_SYNC_FAILED',
    };
    throw new ApiError({
      statusCode: statusByCode[error.code],
      code: apiCodeByCode[error.code],
      message: error.message,
    });
  }

  throw new ApiError({
    statusCode: 500,
    code: 'GIT_SYNC_FAILED',
    message: error instanceof Error
      ? error.message
      : 'Não foi possível sincronizar a branch.',
  });
}

export const gitSyncRoutes: FastifyPluginAsync<GitSyncRouteOptions> = async (
  app,
  options,
) => {
  const service = new GitSyncService();

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

  app.get<{
    Params: ProjectParams;
    Querystring: { reference: string };
  }>(
    '/projects/:projectId/git/sync/compare',
    {
      schema: {
        params: projectParamsSchema,
        querystring: compareQuerySchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['comparison'],
            properties: { comparison: comparisonSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = projectFor(request.params.projectId);
      try {
        return {
          comparison: await service.compare(
            project.path,
            request.query.reference,
          ),
        };
      } catch (error) {
        translateSyncError(error);
      }
    },
  );

  app.post<{
    Params: ProjectParams;
    Body: { reference: string; strategy: GitSyncStrategy };
  }>(
    '/projects/:projectId/git/sync/confirmations',
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
            request.body.reference,
            request.body.strategy,
          ),
        });
      } catch (error) {
        translateSyncError(error);
      }
    },
  );

  app.post<{
    Params: ProjectParams;
    Body: {
      reference: string;
      strategy: GitSyncStrategy;
      confirmationToken: string;
    };
  }>(
    '/projects/:projectId/git/sync',
    {
      schema: {
        params: projectParamsSchema,
        body: mutationBodySchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['result'],
            properties: { result: resultSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = projectFor(request.params.projectId);
      try {
        return {
          result: await service.integrate(
            project.path,
            project.id,
            request.body.reference,
            request.body.strategy,
            request.body.confirmationToken,
          ),
        };
      } catch (error) {
        translateSyncError(error);
      }
    },
  );
};
