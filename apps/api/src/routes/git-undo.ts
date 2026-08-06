import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';

import { ApiError } from '../http/api-error.js';
import {
  GitUndoError,
  GitUndoService,
  type GitUndoOperation,
} from '../services/git-undo-service.js';
import type { GitMutationHistoryService } from '../services/git-mutation-history-service.js';
import type { ProjectStore } from '../store/project-store.js';
import { withGitMutationHistory } from './git-mutation-history-helpers.js';

interface GitUndoRouteOptions extends FastifyPluginOptions {
  projectStore: ProjectStore;
  gitMutationHistoryService: GitMutationHistoryService;
}

interface ProjectParams {
  projectId: string;
}

interface ConfirmationBody {
  operation: GitUndoOperation;
  target: string;
}

interface FileBody {
  path: string;
  confirmationToken: string;
}

interface CommitBody {
  confirmationToken: string;
}

const projectParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId'],
  properties: {
    projectId: { type: 'string', minLength: 1 },
  },
} as const;

const confirmationBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['operation', 'target'],
  properties: {
    operation: { type: 'string', enum: ['commit', 'file'] },
    target: { type: 'string', minLength: 1, maxLength: 4096 },
  },
} as const;

const commitBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['confirmationToken'],
  properties: {
    confirmationToken: { type: 'string', minLength: 64, maxLength: 64 },
  },
} as const;

const fileBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['path', 'confirmationToken'],
  properties: {
    path: { type: 'string', minLength: 1, maxLength: 4096 },
    confirmationToken: { type: 'string', minLength: 64, maxLength: 64 },
  },
} as const;

const commitSummarySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['hash', 'shortHash', 'subject'],
  properties: {
    hash: { type: 'string' },
    shortHash: { type: 'string' },
    subject: { type: 'string' },
  },
} as const;

const confirmationResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['confirmation'],
  properties: {
    confirmation: {
      type: 'object',
      additionalProperties: false,
      required: ['token', 'operation', 'target', 'expiresAt'],
      properties: {
        token: { type: 'string' },
        operation: { type: 'string', enum: ['commit', 'file'] },
        target: { type: 'string' },
        expiresAt: { type: 'string' },
      },
    },
  },
} as const;

const commitResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['undo'],
  properties: {
    undo: {
      type: 'object',
      additionalProperties: false,
      required: ['strategy', 'undone'],
      properties: {
        strategy: { type: 'string', enum: ['reset', 'revert'] },
        undone: commitSummarySchema,
        result: commitSummarySchema,
      },
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
      properties: { path: { type: 'string' } },
    },
  },
} as const;

function translateUndoError(error: unknown): never {
  if (error instanceof GitUndoError) {
    const statusByCode: Record<GitUndoError['code'], number> = {
      GIT_NOT_REPOSITORY: 400,
      GIT_DETACHED_HEAD: 400,
      GIT_WORKING_TREE_DIRTY: 409,
      GIT_MUTATION_CONFIRMATION_REQUIRED: 409,
      GIT_FILE_PATH_INVALID: 400,
      GIT_FILE_NOT_FOUND: 404,
      GIT_COMMIT_FAILED: 409,
      GIT_COMMAND_FAILED: 500,
    };
    const apiCode =
      error.code === 'GIT_COMMAND_FAILED' ? 'GIT_COMMAND_FAILED' : error.code;
    throw new ApiError({
      statusCode: statusByCode[error.code],
      code: apiCode,
      message: error.message,
    });
  }

  throw new ApiError({
    statusCode: 500,
    code: 'GIT_COMMAND_FAILED',
    message:
      error instanceof Error
        ? error.message
        : 'Não foi possível desfazer a operação Git.',
  });
}

export const gitUndoRoutes: FastifyPluginAsync<GitUndoRouteOptions> = async (
  app,
  options,
) => {
  const service = new GitUndoService();

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

  app.post<{ Params: ProjectParams; Body: ConfirmationBody }>(
    '/projects/:projectId/git/undo/confirmations',
    {
      schema: {
        params: projectParamsSchema,
        body: confirmationBodySchema,
        response: { 201: confirmationResponseSchema },
      },
    },
    async (request, reply) => {
      const project = projectFor(request.params.projectId);
      try {
        return reply.code(201).send({
          confirmation: await service.prepareConfirmation(
            project.path,
            project.id,
            request.body.operation,
            request.body.target,
          ),
        });
      } catch (error) {
        translateUndoError(error);
      }
    },
  );

  app.post<{ Params: ProjectParams; Body: CommitBody }>(
    '/projects/:projectId/git/undo/commit',
    {
      schema: {
        params: projectParamsSchema,
        body: commitBodySchema,
        response: { 200: commitResponseSchema },
      },
    },
    async (request) => {
      const project = projectFor(request.params.projectId);
      try {
        return {
          undo: await withGitMutationHistory(
            options.gitMutationHistoryService,
            project,
            'undo-commit',
            () =>
              service.undoLastCommit(
                project.path,
                project.id,
                request.body.confirmationToken,
              ),
          ),
        };
      } catch (error) {
        translateUndoError(error);
      }
    },
  );

  app.post<{ Params: ProjectParams; Body: FileBody }>(
    '/projects/:projectId/git/undo/file',
    {
      schema: {
        params: projectParamsSchema,
        body: fileBodySchema,
        response: { 200: fileResponseSchema },
      },
    },
    async (request) => {
      const project = projectFor(request.params.projectId);
      try {
        return {
          file: await withGitMutationHistory(
            options.gitMutationHistoryService,
            project,
            'undo-file',
            () =>
              service.undoFile(
                project.path,
                project.id,
                request.body.path,
                request.body.confirmationToken,
              ),
          ),
        };
      } catch (error) {
        translateUndoError(error);
      }
    },
  );
};
