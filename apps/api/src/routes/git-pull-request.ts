import type {
  FastifyPluginAsync,
  FastifyPluginOptions,
} from 'fastify';

import type { ProjectStore } from '../store/project-store.js';
import {
  GitPullRequestError,
  GitPullRequestService,
  type GitPullRequestTargetRemote,
} from '../services/git-pull-request-service.js';
import {
  ApiError,
  type ApiErrorCode,
} from '../http/api-error.js';
import {
  commonErrorResponseSchemas,
  gitPullRequestUrlResponseSchema,
} from '../http/response-schemas.js';

interface ProjectParams {
  projectId: string;
}

interface PullRequestBody {
  targetRemote: GitPullRequestTargetRemote;
  baseBranch: string;
  title: string;
  description: string;
}

interface GitPullRequestRouteOptions extends FastifyPluginOptions {
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

const pullRequestBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['targetRemote', 'baseBranch', 'title', 'description'],
  properties: {
    targetRemote: { type: 'string', enum: ['origin', 'upstream'] },
    baseBranch: { type: 'string', minLength: 1, maxLength: 200 },
    title: { type: 'string', minLength: 1, maxLength: 256 },
    description: { type: 'string', maxLength: 20_000 },
  },
} as const;

function translatePullRequestError(error: unknown): never {
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
      GIT_PULL_REQUEST_REMOTE_UNSUPPORTED: 'GIT_PULL_REQUEST_REMOTE_UNSUPPORTED',
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
    code: 'GIT_COMMAND_FAILED',
    message: error instanceof Error
      ? error.message
      : 'Não foi possível compor a URL da Pull Request.',
  });
}

export const gitPullRequestRoutes: FastifyPluginAsync<
  GitPullRequestRouteOptions
> = async (app, options) => {
  const service = new GitPullRequestService();

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

  app.get<{ Params: ProjectParams }>(
    '/projects/:projectId/git/pull-request-url',
    {
      schema: {
        params: projectParamsSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['pullRequest'],
            properties: { pullRequest: gitPullRequestUrlResponseSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = projectFor(request.params.projectId);
      try {
        return { pullRequest: await service.composeUrl(project.path) };
      } catch (error) {
        translatePullRequestError(error);
      }
    },
  );

  app.post<{ Params: ProjectParams; Body: PullRequestBody }>(
    '/projects/:projectId/git/pull-request-url',
    {
      schema: {
        params: projectParamsSchema,
        body: pullRequestBodySchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['pullRequest'],
            properties: { pullRequest: gitPullRequestUrlResponseSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = projectFor(request.params.projectId);
      try {
        return {
          pullRequest: await service.composeUrl(project.path, {
            targetRemote: request.body.targetRemote,
            baseBranch: request.body.baseBranch,
            title: request.body.title,
            description: request.body.description,
          }),
        };
      } catch (error) {
        translatePullRequestError(error);
      }
    },
  );
};
