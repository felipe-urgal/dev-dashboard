import type { FastifyInstance } from 'fastify';

import {
  commonErrorResponseSchemas,
  gitBranchMutationResponseSchema,
  gitMutationConfirmationResponseSchema,
} from '../../http/response-schemas.js';
import { ApiError } from '../../http/api-error.js';
import type { GitBranchPublishService } from '../../services/git-branch-publish-service.js';
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

const publishBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['branch', 'confirmationToken'],
  properties: {
    branch: { type: 'string', minLength: 1, maxLength: 200 },
    confirmationToken: { type: 'string', minLength: 64, maxLength: 64 },
  },
} as const;

function translatePublishError(error: unknown): never {
  if (error instanceof GitMutationError) {
    const statusByCode: Record<string, number> = {
      GIT_NOT_REPOSITORY: 400,
      GIT_BRANCH_INVALID: 400,
      GIT_BRANCH_NOT_FOUND: 404,
      GIT_REMOTE_BRANCH_NOT_FOUND: 404,
      GIT_MUTATION_CONFIRMATION_REQUIRED: 409,
      GIT_REMOTE_NOT_CONFIGURED: 409,
      GIT_PUSH_REJECTED: 409,
      GIT_FORCE_PUSH_CURRENT_BRANCH_REQUIRED: 409,
      GIT_PROTECTED_BRANCH: 409,
      GIT_FORCE_WITH_LEASE_REJECTED: 409,
      GIT_REMOTE_UNAVAILABLE: 502,
      GIT_PUSH_FAILED: 500,
    };
    throw new ApiError({
      statusCode: statusByCode[error.code] ?? 400,
      code: error.code,
      message: error.message,
    });
  }

  throw new ApiError({
    statusCode: 500,
    code: 'GIT_PUSH_FAILED',
    message: error instanceof Error
      ? error.message
      : 'Não foi possível publicar a branch no origin.',
  });
}

function confirmationResponseSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['confirmation'],
    properties: {
      confirmation: gitMutationConfirmationResponseSchema,
    },
  } as const;
}

function branchResponseSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['branch'],
    properties: { branch: gitBranchMutationResponseSchema },
  } as const;
}

export function registerBranchPublishRoutes(
  app: FastifyInstance,
  options: GitWorkspaceRouteOptions,
  publishService: GitBranchPublishService,
): void {
  app.post<{ Params: ProjectParams; Body: { branch: string } }>(
    '/projects/:projectId/git/branches/publish/confirmations',
    {
      schema: {
        params: projectParamsSchema,
        body: branchBodySchema,
        response: {
          201: confirmationResponseSchema(),
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      const project = findProject(options, request.params.projectId);
      try {
        return reply.code(201).send({
          confirmation: publishService.preparePublishConfirmation(
            project.id,
            request.body.branch,
          ),
        });
      } catch (error) {
        translatePublishError(error);
      }
    },
  );

  app.post<{
    Params: ProjectParams;
    Body: { branch: string; confirmationToken: string };
  }>(
    '/projects/:projectId/git/branches/publish',
    {
      schema: {
        params: projectParamsSchema,
        body: publishBodySchema,
        response: {
          200: branchResponseSchema(),
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
            'branch-publish',
            () => publishService.publishLocalBranch(
              project.path,
              project.id,
              request.body.branch,
              request.body.confirmationToken,
            ),
          ),
        };
      } catch (error) {
        translatePublishError(error);
      }
    },
  );

  app.post<{ Params: ProjectParams; Body: { branch: string } }>(
    '/projects/:projectId/git/branches/force-push-with-lease/confirmations',
    {
      schema: {
        params: projectParamsSchema,
        body: branchBodySchema,
        response: {
          201: confirmationResponseSchema(),
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      const project = findProject(options, request.params.projectId);
      try {
        return reply.code(201).send({
          confirmation: await publishService.prepareForcePushWithLeaseConfirmation(
            project.path,
            project.id,
            request.body.branch,
          ),
        });
      } catch (error) {
        translatePublishError(error);
      }
    },
  );

  app.post<{
    Params: ProjectParams;
    Body: { branch: string; confirmationToken: string };
  }>(
    '/projects/:projectId/git/branches/force-push-with-lease',
    {
      schema: {
        params: projectParamsSchema,
        body: publishBodySchema,
        response: {
          200: branchResponseSchema(),
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
            'branch-force-push-with-lease',
            () => publishService.forcePushWithLease(
              project.path,
              project.id,
              request.body.branch,
              request.body.confirmationToken,
            ),
          ),
        };
      } catch (error) {
        translatePublishError(error);
      }
    },
  );
}
