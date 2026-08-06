import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';

import { ApiError, type ApiErrorCode } from '../http/api-error.js';
import { commonErrorResponseSchemas } from '../http/response-schemas.js';
import {
  GitPullRequestMutationError,
  GitPullRequestMutationService,
  type GitPullRequestMutationInput,
} from '../services/git-pull-request-mutation-service.js';
import { GitPullRequestError } from '../services/git-pull-request/errors.js';
import type { GitMutationHistoryService } from '../services/git-mutation-history-service.js';
import type { ProjectStore } from '../store/project-store.js';
import { withGitMutationHistory } from './git-mutation-history-helpers.js';

interface GitPullRequestMutationRouteOptions extends FastifyPluginOptions {
  projectStore: ProjectStore;
  gitMutationHistoryService: GitMutationHistoryService;
}

interface ProjectParams {
  projectId: string;
}

const ACTION_IDS = [
  'pull-request-create',
  'pull-request-edit',
  'pull-request-close',
  'pull-request-merge',
] as const;

const projectParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId'],
  properties: { projectId: { type: 'string', minLength: 1 } },
} as const;

const actionInputSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['actionId'],
  properties: {
    actionId: { type: 'string', enum: ACTION_IDS },
    targetRemote: { type: 'string', enum: ['origin', 'upstream'] },
    baseBranch: { type: 'string', minLength: 1, maxLength: 200 },
    title: { type: 'string', minLength: 1, maxLength: 256 },
    description: { type: 'string', maxLength: 20_000 },
    draft: { type: 'boolean' },
    number: { type: 'integer', minimum: 1 },
    mergeMethod: { type: 'string', enum: ['merge', 'squash', 'rebase'] },
  },
} as const;

const confirmationBodySchema = actionInputSchema;

const executeBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: [...actionInputSchema.required, 'confirmationToken'],
  properties: {
    ...actionInputSchema.properties,
    confirmationToken: { type: 'string', minLength: 64, maxLength: 64 },
  },
} as const;

const confirmationSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['token', 'actionId', 'expiresAt'],
  properties: {
    token: { type: 'string' },
    actionId: { type: 'string', enum: ACTION_IDS },
    expiresAt: { type: 'string' },
  },
} as const;

const mutationResultSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['action', 'number', 'url', 'title', 'state'],
  properties: {
    action: { type: 'string', enum: ACTION_IDS },
    number: { type: 'integer', minimum: 1 },
    url: { type: 'string' },
    title: { type: 'string' },
    state: { type: 'string', enum: ['open', 'closed', 'merged'] },
  },
} as const;

function translateError(error: unknown): never {
  if (error instanceof GitPullRequestMutationError) {
    const statusByCode: Record<GitPullRequestMutationError['code'], number> = {
      GIT_PULL_REQUEST_ACTION_NOT_FOUND: 404,
      GIT_PULL_REQUEST_ACTION_INVALID_INPUT: 400,
      GIT_PULL_REQUEST_MUTATION_CONFIRMATION_REQUIRED: 409,
      GIT_PULL_REQUEST_MUTATION_FAILED: 500,
    };
    throw new ApiError({
      statusCode: statusByCode[error.code],
      code: error.code,
      message: error.message,
    });
  }
  if (error instanceof GitPullRequestError) {
    const statusByCode: Record<GitPullRequestError['code'], number> = {
      GIT_NOT_REPOSITORY: 400,
      GIT_DETACHED_HEAD: 400,
      GIT_REMOTE_NOT_CONFIGURED: 409,
      GIT_PULL_REQUEST_NOT_PUBLISHED: 409,
      GIT_PULL_REQUEST_BRANCH_IS_DEFAULT: 409,
      GIT_PULL_REQUEST_REMOTE_UNSUPPORTED: 422,
      GIT_PULL_REQUEST_BASE_NOT_FOUND: 404,
    };
    const apiCodeByCode: Record<GitPullRequestError['code'], ApiErrorCode> = {
      GIT_NOT_REPOSITORY: 'GIT_NOT_REPOSITORY',
      GIT_DETACHED_HEAD: 'GIT_DETACHED_HEAD',
      GIT_REMOTE_NOT_CONFIGURED: 'GIT_REMOTE_NOT_CONFIGURED',
      GIT_PULL_REQUEST_NOT_PUBLISHED: 'GIT_PULL_REQUEST_NOT_PUBLISHED',
      GIT_PULL_REQUEST_BRANCH_IS_DEFAULT: 'GIT_PULL_REQUEST_BRANCH_IS_DEFAULT',
      GIT_PULL_REQUEST_REMOTE_UNSUPPORTED:
        'GIT_PULL_REQUEST_REMOTE_UNSUPPORTED',
      GIT_PULL_REQUEST_BASE_NOT_FOUND: 'GIT_BRANCH_NOT_FOUND',
    };
    throw new ApiError({
      statusCode: statusByCode[error.code],
      code: apiCodeByCode[error.code],
      message: error.message,
    });
  }
  throw new ApiError({
    statusCode: 500,
    code: 'GIT_PULL_REQUEST_MUTATION_FAILED',
    message: 'Não foi possível executar a ação de Pull Request.',
  });
}

export const gitPullRequestMutationRoutes: FastifyPluginAsync<
  GitPullRequestMutationRouteOptions
> = async (app, options) => {
  const service = new GitPullRequestMutationService();

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

  app.post<{
    Params: ProjectParams;
    Body: GitPullRequestMutationInput & {
      actionId: (typeof ACTION_IDS)[number];
    };
  }>(
    '/projects/:projectId/git/pull-request/confirmations',
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
      const { actionId, ...input } = request.body;
      try {
        return reply.code(201).send({
          confirmation: service.prepareConfirmation(
            project.id,
            actionId,
            input,
          ),
        });
      } catch (error) {
        translateError(error);
      }
    },
  );

  app.post<{
    Params: ProjectParams;
    Body: GitPullRequestMutationInput & {
      actionId: (typeof ACTION_IDS)[number];
      confirmationToken: string;
    };
  }>(
    '/projects/:projectId/git/pull-request/actions',
    {
      schema: {
        params: projectParamsSchema,
        body: executeBodySchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['result'],
            properties: { result: mutationResultSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = projectFor(request.params.projectId);
      const { actionId, confirmationToken, ...input } = request.body;
      try {
        return {
          result: await withGitMutationHistory(
            options.gitMutationHistoryService,
            project,
            actionId,
            () =>
              service.execute(
                project.path,
                project.id,
                actionId,
                input,
                confirmationToken,
              ),
          ),
        };
      } catch (error) {
        translateError(error);
      }
    },
  );
};
