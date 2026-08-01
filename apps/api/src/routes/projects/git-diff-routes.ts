import type { FastifyInstance } from 'fastify';

import { ApiError } from '../../http/api-error.js';
import {
  commonErrorResponseSchemas,
  gitDiffSnapshotResponseSchema,
  gitFileDiffResponseSchema,
  gitFileLinesResponseSchema,
  projectGitOverviewResponseSchema,
} from '../../http/response-schemas.js';
import { GitDiffError } from '../../services/git-service.js';
import {
  gitDiffErrorStatus,
  projectParamsSchema,
  type ProjectParams,
  type ProjectRouteOptions,
} from './helpers.js';

export function registerGitDiffRoutes(
  app: FastifyInstance,
  options: ProjectRouteOptions,
): void {
  const { projectStore, gitService } = options;

  app.get<{ Params: ProjectParams }>(
    '/projects/:projectId/git',
    {
      schema: {
        params: projectParamsSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['git'],
            properties: { git: projectGitOverviewResponseSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = projectStore.findProject(request.params.projectId);
      if (!project) {
        throw new ApiError({ statusCode: 404, code: 'PROJECT_NOT_FOUND', message: 'Projeto não encontrado.' });
      }
      try {
        return { git: await gitService.getOverview(project.path) };
      } catch (error) {
        throw new ApiError({
          statusCode: 500,
          code: 'GIT_COMMAND_FAILED',
          message: error instanceof Error ? error.message : 'Não foi possível consultar o repositório Git.',
        });
      }
    },
  );

  app.get<{ Params: ProjectParams; Querystring: { scope?: 'worktree' | 'index' | 'combined' } }>(
    '/projects/:projectId/git/diff',
    {
      schema: {
        params: projectParamsSchema,
        querystring: {
          type: 'object', additionalProperties: false,
          properties: { scope: { type: 'string', enum: ['worktree', 'index', 'combined'] } },
        },
        response: {
          200: {
            type: 'object', additionalProperties: false,
            required: ['diff'],
            properties: { diff: gitDiffSnapshotResponseSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = projectStore.findProject(request.params.projectId);
      if (!project) throw new ApiError({ statusCode: 404, code: 'PROJECT_NOT_FOUND', message: 'Projeto não encontrado.' });
      try {
        return { diff: await gitService.getDiffSnapshot(project.path, request.query.scope ?? 'combined') };
      } catch (error) {
        throw new ApiError({
          statusCode: 500, code: 'GIT_COMMAND_FAILED',
          message: error instanceof Error ? error.message : 'Não foi possível consultar o diff do repositório.',
        });
      }
    },
  );

  app.get<{ Params: ProjectParams; Querystring: { path: string; scope?: 'worktree' | 'index' | 'combined' } }>(
    '/projects/:projectId/git/diff/file',
    {
      schema: {
        params: projectParamsSchema,
        querystring: {
          type: 'object', additionalProperties: false,
          required: ['path'],
          properties: {
            path: { type: 'string', minLength: 1, maxLength: 2048 },
            scope: { type: 'string', enum: ['worktree', 'index', 'combined'] },
          },
        },
        response: {
          200: {
            type: 'object', additionalProperties: false,
            required: ['file'],
            properties: { file: gitFileDiffResponseSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = projectStore.findProject(request.params.projectId);
      if (!project) throw new ApiError({ statusCode: 404, code: 'PROJECT_NOT_FOUND', message: 'Projeto não encontrado.' });
      try {
        return { file: await gitService.getFileDiff(project.path, request.query.path, request.query.scope ?? 'combined') };
      } catch (error) {
        if (error instanceof GitDiffError) {
          throw new ApiError({ statusCode: gitDiffErrorStatus(error), code: error.code, message: error.message });
        }
        throw new ApiError({
          statusCode: 500, code: 'GIT_COMMAND_FAILED',
          message: error instanceof Error ? error.message : 'Não foi possível carregar o diff do arquivo.',
        });
      }
    },
  );

  app.get<{
    Params: ProjectParams;
    Querystring: { path: string; scope?: 'worktree' | 'index' | 'combined'; start: number; end: number };
  }>(
    '/projects/:projectId/git/diff/file/lines',
    {
      schema: {
        params: projectParamsSchema,
        querystring: {
          type: 'object', additionalProperties: false,
          required: ['path', 'start', 'end'],
          properties: {
            path: { type: 'string', minLength: 1, maxLength: 2048 },
            scope: { type: 'string', enum: ['worktree', 'index', 'combined'] },
            start: { type: 'integer', minimum: 1 },
            end: { type: 'integer', minimum: 1 },
          },
        },
        response: {
          200: {
            type: 'object', additionalProperties: false,
            required: ['lines'],
            properties: { lines: gitFileLinesResponseSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = projectStore.findProject(request.params.projectId);
      if (!project) throw new ApiError({ statusCode: 404, code: 'PROJECT_NOT_FOUND', message: 'Projeto não encontrado.' });
      try {
        return {
          lines: await gitService.getFileLines(
            project.path,
            request.query.path,
            request.query.scope ?? 'combined',
            request.query.start,
            request.query.end,
          ),
        };
      } catch (error) {
        if (error instanceof GitDiffError) {
          throw new ApiError({ statusCode: gitDiffErrorStatus(error), code: error.code, message: error.message });
        }
        throw new ApiError({
          statusCode: 500, code: 'GIT_COMMAND_FAILED',
          message: error instanceof Error ? error.message : 'Não foi possível ler as linhas do arquivo.',
        });
      }
    },
  );
}
