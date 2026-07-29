import type {
  FastifyPluginAsync,
  FastifyPluginOptions,
} from 'fastify';

import { ApiError, type ApiErrorCode } from '../http/api-error.js';
import { commonErrorResponseSchemas } from '../http/response-schemas.js';
import {
  GitBranchDeleteError,
  GitBranchDeleteService,
} from '../services/git-branch-delete-service.js';
import type { ProjectStore } from '../store/project-store.js';

interface GitBranchDeleteRouteOptions extends FastifyPluginOptions {
  projectStore: ProjectStore;
}

interface ProjectParams {
  projectId: string;
}

const projectParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId'],
  properties: { projectId: { type: 'string', minLength: 1 } },
} as const;

const branchBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['branch'],
  properties: {
    branch: { type: 'string', minLength: 1, maxLength: 200 },
  },
} as const;

const deleteBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['branch', 'confirmationToken'],
  properties: {
    branch: { type: 'string', minLength: 1, maxLength: 200 },
    confirmationToken: { type: 'string', minLength: 64, maxLength: 64 },
  },
} as const;

const confirmationSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['token', 'operation', 'target', 'expiresAt'],
  properties: {
    token: { type: 'string' },
    operation: { type: 'string', enum: ['delete-branch'] },
    target: { type: 'string' },
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
  if (error instanceof GitBranchDeleteError) {
    const statusByCode: Record<GitBranchDeleteError['code'], number> = {
      GIT_NOT_REPOSITORY: 400,
      GIT_BRANCH_INVALID: 400,
      GIT_BRANCH_NOT_FOUND: 404,
      GIT_BRANCH_CURRENT: 409,
      GIT_BRANCH_PROTECTED: 409,
      GIT_BRANCH_NOT_MERGED: 409,
      GIT_MUTATION_CONFIRMATION_REQUIRED: 409,
      GIT_COMMAND_FAILED: 500,
    };
    const apiCodeByCode: Record<GitBranchDeleteError['code'], ApiErrorCode> = {
      GIT_NOT_REPOSITORY: 'GIT_NOT_REPOSITORY',
      GIT_BRANCH_INVALID: 'GIT_BRANCH_INVALID',
      GIT_BRANCH_NOT_FOUND: 'GIT_BRANCH_NOT_FOUND',
      GIT_BRANCH_CURRENT: 'GIT_COMMAND_FAILED',
      GIT_BRANCH_PROTECTED: 'GIT_COMMAND_FAILED',
      GIT_BRANCH_NOT_MERGED: 'GIT_COMMAND_FAILED',
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
    message: error instanceof Error
      ? error.message
      : 'Não foi possível remover a branch.',
  });
}

export const gitBranchDeleteRoutes: FastifyPluginAsync<
  GitBranchDeleteRouteOptions
> = async (app, options) => {
  const service = new GitBranchDeleteService();

  app.post<{ Params: ProjectParams; Body: { branch: string } }>(
    '/projects/:projectId/git/branches/delete/confirmations',
    {
      schema: {
        params: projectParamsSchema,
        body: branchBodySchema,
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
      const project = options.projectStore.findProject(request.params.projectId);
      if (!project) {
        throw new ApiError({
          statusCode: 404,
          code: 'PROJECT_NOT_FOUND',
          message: 'Projeto não encontrado.',
        });
      }
      try {
        return reply.code(201).send({
          confirmation: service.prepareConfirmation(project.id, request.body.branch),
        });
      } catch (error) {
        translateError(error);
      }
    },
  );

  app.post<{
    Params: ProjectParams;
    Body: { branch: string; confirmationToken: string };
  }>(
    '/projects/:projectId/git/branches/delete',
    {
      schema: {
        params: projectParamsSchema,
        body: deleteBodySchema,
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
          branch: await service.deleteLocalBranch(
            project.path,
            project.id,
            request.body.branch,
            request.body.confirmationToken,
          ),
        };
      } catch (error) {
        translateError(error);
      }
    },
  );
};
