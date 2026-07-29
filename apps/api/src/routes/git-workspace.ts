import type {
  FastifyPluginAsync,
  FastifyPluginOptions,
} from 'fastify';

import type { ProjectStore } from '../store/project-store.js';
import {
  GitWorkspaceError,
  GitWorkspaceService,
} from '../services/git-workspace-service.js';
import {
  ApiError,
  type ApiErrorCode,
} from '../http/api-error.js';
import {
  apiErrorResponseSchema,
  commonErrorResponseSchemas,
} from '../http/response-schemas.js';

interface ProjectParams {
  projectId: string;
}

interface RemoteParams extends ProjectParams {
  remote: string;
}

interface GitWorkspaceRouteOptions extends FastifyPluginOptions {
  projectStore: ProjectStore;
}

const projectParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId'],
  properties: {
    projectId: { type: 'string', minLength: 1 },
  },
} as const;

const remoteParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId', 'remote'],
  properties: {
    projectId: { type: 'string', minLength: 1 },
    remote: {
      type: 'string',
      minLength: 1,
      maxLength: 100,
      pattern: '^[A-Za-z0-9._-]+$',
    },
  },
} as const;

const gitTrackingComparisonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['reference', 'ahead', 'behind'],
  properties: {
    reference: { type: 'string' },
    ahead: { type: 'integer', minimum: 0 },
    behind: { type: 'integer', minimum: 0 },
  },
} as const;

const projectGitWorkspaceSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['branches', 'remotes'],
  properties: {
    branches: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'shortName', 'kind', 'current'],
        properties: {
          name: { type: 'string' },
          shortName: { type: 'string' },
          kind: { type: 'string', enum: ['local', 'remote'] },
          current: { type: 'boolean' },
          remote: { type: 'string' },
          upstream: { type: 'string' },
        },
      },
    },
    remotes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'fetchUrl', 'pushUrl', 'role'],
        properties: {
          name: { type: 'string' },
          fetchUrl: { type: 'string' },
          pushUrl: { type: 'string' },
          role: { type: 'string', enum: ['origin', 'upstream', 'other'] },
        },
      },
    },
    originComparison: gitTrackingComparisonSchema,
    upstreamComparison: gitTrackingComparisonSchema,
  },
} as const;

export const gitWorkspaceRoutes: FastifyPluginAsync<
  GitWorkspaceRouteOptions
> = async (app, options) => {
  const service = new GitWorkspaceService();

  app.get<{ Params: ProjectParams }>(
    '/projects/:projectId/git/workspace',
    {
      schema: {
        params: projectParamsSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['workspace'],
            properties: {
              workspace: projectGitWorkspaceSchema,
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = options.projectStore.findProject(request.params.projectId);
      if (!project) {
        throw new ApiError({
          statusCode: 404,
          code: 'PROJECT_NOT_FOUND',
          message: 'Projeto não encontrado.',
        });
      }

      try {
        return {
          workspace: await service.inspect(project.path),
        };
      } catch (error) {
        throw new ApiError({
          statusCode: 500,
          code: 'GIT_COMMAND_FAILED',
          message: error instanceof Error
            ? error.message
            : 'Não foi possível consultar branches e remotos.',
        });
      }
    },
  );

  app.post<{ Params: RemoteParams }>(
    '/projects/:projectId/git/remotes/:remote/fetch',
    {
      schema: {
        params: remoteParamsSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['remote'],
            properties: {
              remote: { type: 'string' },
            },
          },
          ...commonErrorResponseSchemas,
          502: apiErrorResponseSchema,
        },
      },
    },
    async (request) => {
      const project = options.projectStore.findProject(request.params.projectId);
      if (!project) {
        throw new ApiError({
          statusCode: 404,
          code: 'PROJECT_NOT_FOUND',
          message: 'Projeto não encontrado.',
        });
      }

      try {
        await service.fetchRemote(project.path, request.params.remote);
        return { remote: request.params.remote };
      } catch (error) {
        if (error instanceof GitWorkspaceError) {
          const statusByCode: Record<GitWorkspaceError['code'], number> = {
            GIT_NOT_REPOSITORY: 400,
            GIT_REMOTE_INVALID: 400,
            GIT_REMOTE_NOT_CONFIGURED: 404,
            GIT_REMOTE_UNAVAILABLE: 502,
            GIT_FETCH_FAILED: 500,
          };
          const apiCodeByCode: Record<GitWorkspaceError['code'], ApiErrorCode> = {
            GIT_NOT_REPOSITORY: 'GIT_NOT_REPOSITORY',
            GIT_REMOTE_INVALID: 'BAD_REQUEST',
            GIT_REMOTE_NOT_CONFIGURED: 'GIT_REMOTE_NOT_CONFIGURED',
            GIT_REMOTE_UNAVAILABLE: 'GIT_REMOTE_UNAVAILABLE',
            GIT_FETCH_FAILED: 'GIT_COMMAND_FAILED',
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
            : 'Não foi possível atualizar o remote.',
        });
      }
    },
  );
};
