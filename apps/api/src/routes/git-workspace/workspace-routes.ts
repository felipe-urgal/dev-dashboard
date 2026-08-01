import type { FastifyInstance } from 'fastify';

import { GitWorkspaceError, type GitWorkspaceService } from '../../services/git-workspace-service.js';
import { ApiError, type ApiErrorCode } from '../../http/api-error.js';
import { apiErrorResponseSchema, commonErrorResponseSchemas } from '../../http/response-schemas.js';
import {
  findProject,
  projectGitWorkspaceSchema,
  projectParamsSchema,
  remoteParamsSchema,
  type GitWorkspaceRouteOptions,
  type ProjectParams,
  type RemoteParams,
} from './helpers.js';

export function registerWorkspaceRoutes(
  app: FastifyInstance,
  options: GitWorkspaceRouteOptions,
  workspaceService: GitWorkspaceService,
): void {
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
            properties: { workspace: projectGitWorkspaceSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = findProject(options, request.params.projectId);
      try {
        return { workspace: await workspaceService.inspect(project.path) };
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
            properties: { remote: { type: 'string' } },
          },
          ...commonErrorResponseSchemas,
          502: apiErrorResponseSchema,
        },
      },
    },
    async (request) => {
      const project = findProject(options, request.params.projectId);
      try {
        await workspaceService.fetchRemote(project.path, request.params.remote);
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
}
