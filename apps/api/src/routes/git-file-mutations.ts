import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';

import { ApiError } from '../http/api-error.js';
import { GitMutationError, type GitService } from '../services/git-service.js';
import type { GitMutationHistoryService } from '../services/git-mutation-history-service.js';
import type { ProjectStore } from '../store/project-store.js';
import { withGitMutationHistory } from './git-mutation-history-helpers.js';

interface GitFileMutationRouteOptions extends FastifyPluginOptions {
  projectStore: ProjectStore;
  gitService: GitService;
  gitMutationHistoryService: GitMutationHistoryService;
}

interface ProjectParams {
  projectId: string;
}

interface FileBody {
  path: string;
  confirmationToken?: string;
}

const projectParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId'],
  properties: {
    projectId: { type: 'string', minLength: 1 },
  },
} as const;

const fileBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['path'],
  properties: {
    path: { type: 'string', minLength: 1, maxLength: 4096 },
    confirmationToken: {
      type: 'string',
      minLength: 64,
      maxLength: 64,
    },
  },
} as const;

const fileResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['file'],
  properties: {
    file: {
      type: 'object',
      additionalProperties: false,
      required: ['path'],
      properties: {
        path: { type: 'string' },
      },
    },
  },
} as const;

function translateMutationError(error: unknown): never {
  if (error instanceof GitMutationError) {
    const statuses: Record<string, number> = {
      GIT_NOT_REPOSITORY: 400,
      GIT_FILE_PATH_INVALID: 400,
      GIT_FILE_NOT_FOUND: 404,
      GIT_FILE_OPERATION_NOT_ALLOWED: 409,
      GIT_MUTATION_CONFIRMATION_REQUIRED: 409,
      GIT_FILE_MUTATION_FAILED: 500,
    };
    throw new ApiError({
      statusCode: statuses[error.code] ?? 400,
      code: error.code,
      message: error.message,
    });
  }

  throw new ApiError({
    statusCode: 500,
    code: 'GIT_COMMAND_FAILED',
    message:
      error instanceof Error
        ? error.message
        : 'Não foi possível alterar o arquivo.',
  });
}

export const gitFileMutationRoutes: FastifyPluginAsync<
  GitFileMutationRouteOptions
> = async (app, options) => {
  const { projectStore, gitService, gitMutationHistoryService } = options;

  function resolveProject(projectId: string) {
    const project = projectStore.findProject(projectId);
    if (!project) {
      throw new ApiError({
        statusCode: 404,
        code: 'PROJECT_NOT_FOUND',
        message: 'Projeto não encontrado.',
      });
    }
    return project;
  }

  app.post<{ Params: ProjectParams; Body: FileBody }>(
    '/projects/:projectId/git/files/stage',
    {
      schema: {
        params: projectParamsSchema,
        body: fileBodySchema,
        response: { 200: fileResponseSchema },
      },
    },
    async (request) => {
      const project = resolveProject(request.params.projectId);
      try {
        return {
          file: await gitService.stageFile(project.path, request.body.path),
        };
      } catch (error) {
        translateMutationError(error);
      }
    },
  );

  app.post<{ Params: ProjectParams; Body: FileBody }>(
    '/projects/:projectId/git/files/unstage',
    {
      schema: {
        params: projectParamsSchema,
        body: fileBodySchema,
        response: { 200: fileResponseSchema },
      },
    },
    async (request) => {
      const project = resolveProject(request.params.projectId);
      try {
        return {
          file: await gitService.unstageFile(project.path, request.body.path),
        };
      } catch (error) {
        translateMutationError(error);
      }
    },
  );

  app.post<{ Params: ProjectParams; Body: FileBody }>(
    '/projects/:projectId/git/files/discard',
    {
      schema: {
        params: projectParamsSchema,
        body: fileBodySchema,
        response: { 200: fileResponseSchema },
      },
    },
    async (request) => {
      const project = resolveProject(request.params.projectId);
      try {
        return {
          file: await withGitMutationHistory(
            gitMutationHistoryService,
            project,
            'discard-file',
            () =>
              gitService.discardFile(
                project.path,
                project.id,
                request.body.path,
                request.body.confirmationToken,
              ),
          ),
        };
      } catch (error) {
        translateMutationError(error);
      }
    },
  );

  app.post<{ Params: ProjectParams; Body: FileBody }>(
    '/projects/:projectId/git/files/remove',
    {
      schema: {
        params: projectParamsSchema,
        body: fileBodySchema,
        response: { 200: fileResponseSchema },
      },
    },
    async (request) => {
      const project = resolveProject(request.params.projectId);
      try {
        return {
          file: await withGitMutationHistory(
            gitMutationHistoryService,
            project,
            'remove-untracked-file',
            () =>
              gitService.removeUntrackedFile(
                project.path,
                project.id,
                request.body.path,
                request.body.confirmationToken,
              ),
          ),
        };
      } catch (error) {
        translateMutationError(error);
      }
    },
  );
};
