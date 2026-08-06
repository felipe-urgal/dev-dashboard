import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';

import { ApiError, type ApiErrorCode } from '../http/api-error.js';
import { commonErrorResponseSchemas } from '../http/response-schemas.js';
import {
  GitBranchRenameError,
  GitBranchRenameService,
} from '../services/git-branch-rename-service.js';
import type { GitMutationHistoryService } from '../services/git-mutation-history-service.js';
import type { ProjectStore } from '../store/project-store.js';
import { withGitMutationHistory } from './git-mutation-history-helpers.js';

interface GitBranchRenameRouteOptions extends FastifyPluginOptions {
  projectStore: ProjectStore;
  gitMutationHistoryService: GitMutationHistoryService;
}

interface ProjectParams {
  projectId: string;
}

interface RenameBody {
  currentName: string;
  nextName: string;
}

interface RenameMutationBody extends RenameBody {
  confirmationToken: string;
}

const projectParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId'],
  properties: { projectId: { type: 'string', minLength: 1 } },
} as const;

const renameBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['currentName', 'nextName'],
  properties: {
    currentName: { type: 'string', minLength: 1, maxLength: 200 },
    nextName: { type: 'string', minLength: 1, maxLength: 200 },
  },
} as const;

const renameMutationBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['currentName', 'nextName', 'confirmationToken'],
  properties: {
    ...renameBodySchema.properties,
    confirmationToken: { type: 'string', minLength: 64, maxLength: 64 },
  },
} as const;

const confirmationSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['token', 'operation', 'currentName', 'nextName', 'expiresAt'],
  properties: {
    token: { type: 'string' },
    operation: { type: 'string', enum: ['rename-branch'] },
    currentName: { type: 'string' },
    nextName: { type: 'string' },
    expiresAt: { type: 'string' },
  },
} as const;

const branchResultSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['branch'],
  properties: { branch: { type: 'string' } },
} as const;

function translateError(error: unknown): never {
  if (error instanceof GitBranchRenameError) {
    const statusByCode: Record<GitBranchRenameError['code'], number> = {
      GIT_NOT_REPOSITORY: 400,
      GIT_BRANCH_INVALID: 400,
      GIT_BRANCH_NOT_FOUND: 404,
      GIT_BRANCH_EXISTS: 409,
      GIT_BRANCH_PROTECTED: 409,
      GIT_MUTATION_CONFIRMATION_REQUIRED: 409,
      GIT_COMMAND_FAILED: 500,
    };
    const apiCodeByCode: Record<GitBranchRenameError['code'], ApiErrorCode> = {
      GIT_NOT_REPOSITORY: 'GIT_NOT_REPOSITORY',
      GIT_BRANCH_INVALID: 'GIT_BRANCH_INVALID',
      GIT_BRANCH_NOT_FOUND: 'GIT_BRANCH_NOT_FOUND',
      GIT_BRANCH_EXISTS: 'GIT_BRANCH_EXISTS',
      GIT_BRANCH_PROTECTED: 'GIT_COMMAND_FAILED',
      GIT_MUTATION_CONFIRMATION_REQUIRED: 'GIT_MUTATION_CONFIRMATION_REQUIRED',
      GIT_COMMAND_FAILED: 'GIT_COMMAND_FAILED',
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
    message:
      error instanceof Error
        ? error.message
        : 'Não foi possível renomear a branch.',
  });
}

export const gitBranchRenameRoutes: FastifyPluginAsync<
  GitBranchRenameRouteOptions
> = async (app, options) => {
  const service = new GitBranchRenameService();

  app.post<{ Params: ProjectParams; Body: RenameBody }>(
    '/projects/:projectId/git/branches/rename/confirmations',
    {
      schema: {
        params: projectParamsSchema,
        body: renameBodySchema,
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
      const project = options.projectStore.findProject(
        request.params.projectId,
      );
      if (!project) {
        throw new ApiError({
          statusCode: 404,
          code: 'PROJECT_NOT_FOUND',
          message: 'Projeto não encontrado.',
        });
      }

      try {
        return reply.code(201).send({
          confirmation: service.prepareConfirmation(
            project.id,
            request.body.currentName,
            request.body.nextName,
          ),
        });
      } catch (error) {
        translateError(error);
      }
    },
  );

  app.post<{ Params: ProjectParams; Body: RenameMutationBody }>(
    '/projects/:projectId/git/branches/rename',
    {
      schema: {
        params: projectParamsSchema,
        body: renameMutationBodySchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['branch'],
            properties: { branch: branchResultSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = options.projectStore.findProject(
        request.params.projectId,
      );
      if (!project) {
        throw new ApiError({
          statusCode: 404,
          code: 'PROJECT_NOT_FOUND',
          message: 'Projeto não encontrado.',
        });
      }

      try {
        return {
          branch: await withGitMutationHistory(
            options.gitMutationHistoryService,
            project,
            'branch-rename',
            () =>
              service.renameLocalBranch(
                project.path,
                project.id,
                request.body.currentName,
                request.body.nextName,
                request.body.confirmationToken,
              ),
          ),
        };
      } catch (error) {
        translateError(error);
      }
    },
  );
};
