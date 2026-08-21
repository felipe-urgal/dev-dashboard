import type { FastifyInstance } from 'fastify';

import {
  commonErrorResponseSchemas,
  gitBranchMutationResponseSchema,
  gitMutationConfirmationResponseSchema,
} from '../../http/response-schemas.js';
import { ApiError } from '../../http/api-error.js';
import type { GitBranchSquashService } from '../../services/git-branch-squash-service.js';
import { GitMutationError } from '../../services/git-service/errors.js';
import { withGitMutationHistory } from '../git-mutation-history-helpers.js';
import {
  findProject,
  projectParamsSchema,
  type GitWorkspaceRouteOptions,
  type ProjectParams,
} from './helpers.js';

const branchBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['branch'],
  properties: {
    branch: { type: 'string', minLength: 1, maxLength: 200 },
  },
} as const;

const squashBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['branch', 'message', 'confirmationToken'],
  properties: {
    branch: { type: 'string', minLength: 1, maxLength: 200 },
    message: { type: 'string', minLength: 1, maxLength: 500 },
    confirmationToken: { type: 'string', minLength: 64, maxLength: 64 },
  },
} as const;

function translateSquashError(error: unknown): never {
  if (error instanceof GitMutationError) {
    const statusByCode: Record<string, number> = {
      GIT_NOT_REPOSITORY: 400,
      GIT_BRANCH_INVALID: 400,
      GIT_BRANCH_NOT_FOUND: 404,
      GIT_WORKING_TREE_DIRTY: 409,
      GIT_MUTATION_CONFIRMATION_REQUIRED: 409,
      GIT_SQUASH_CURRENT_BRANCH_REQUIRED: 409,
      GIT_PROTECTED_BRANCH: 409,
      GIT_SQUASH_NOT_AVAILABLE: 409,
      GIT_COMMIT_MESSAGE_INVALID: 400,
      GIT_SQUASH_FAILED: 500,
    };
    throw new ApiError({
      statusCode: statusByCode[error.code] ?? 400,
      code: error.code,
      message: error.message,
    });
  }

  throw new ApiError({
    statusCode: 500,
    code: 'GIT_SQUASH_FAILED',
    message:
      error instanceof Error
        ? error.message
        : 'Não foi possível condensar os commits da branch.',
  });
}

export function registerBranchSquashRoutes(
  app: FastifyInstance,
  options: GitWorkspaceRouteOptions,
  squashService: GitBranchSquashService,
): void {
  app.post<{ Params: ProjectParams; Body: { branch: string } }>(
    '/projects/:projectId/git/branches/squash/confirmations',
    {
      schema: {
        params: projectParamsSchema,
        body: branchBodySchema,
        response: {
          201: {
            type: 'object',
            additionalProperties: false,
            required: ['confirmation'],
            properties: {
              confirmation: gitMutationConfirmationResponseSchema,
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      const project = findProject(options, request.params.projectId);
      try {
        return reply.code(201).send({
          confirmation: await squashService.prepareConfirmation(
            project.path,
            project.id,
            request.body.branch,
          ),
        });
      } catch (error) {
        translateSquashError(error);
      }
    },
  );

  app.post<{
    Params: ProjectParams;
    Body: { branch: string; message: string; confirmationToken: string };
  }>(
    '/projects/:projectId/git/branches/squash',
    {
      schema: {
        params: projectParamsSchema,
        body: squashBodySchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['branch'],
            properties: { branch: gitBranchMutationResponseSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = findProject(options, request.params.projectId);
      try {
        return {
          branch: await withGitMutationHistory(
            options.gitMutationHistoryService,
            project,
            'branch-squash',
            () =>
              squashService.squash(
                project.path,
                project.id,
                request.body.branch,
                request.body.message,
                request.body.confirmationToken,
              ),
          ),
        };
      } catch (error) {
        translateSquashError(error);
      }
    },
  );
}
