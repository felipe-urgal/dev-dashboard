import type {
  FastifyPluginAsync,
  FastifyPluginOptions,
} from 'fastify';

import type { ProjectStore } from '../store/project-store.js';
import {
  GitBranchService,
  GitBranchServiceError,
} from '../services/git-branch-service.js';
import {
  GitWorkspaceError,
  GitWorkspaceService,
} from '../services/git-workspace-service.js';
import {
  ApiError,
  type ApiErrorCode,
} from '../http/api-error.js';
import {
  apiErrorResponseSchema,
  commonErrorResponseSchemas,
  gitBranchMutationResponseSchema,
} from '../http/response-schemas.js';

interface ProjectParams {
  projectId: string;
}

interface RemoteParams extends ProjectParams {
  remote: string;
}

interface GitWorkspaceRouteOptions extends FastifyPluginOptions {
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

const remoteParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId', 'remote'],
  properties: {
    projectId: { type: 'string', minLength: 1 },
    remote: {
      type: 'string',
      minLength: 1,
      maxLength: 100,
      pattern: '^[A-Za-z0-9._-]+$',
    },
  },
} as const;

const gitCommitSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['hash', 'shortHash', 'subject', 'authorName', 'authorEmail', 'authoredAt'],
  properties: {
    hash: { type: 'string' },
    shortHash: { type: 'string' },
    subject: { type: 'string' },
    authorName: { type: 'string' },
    authorEmail: { type: 'string' },
    authoredAt: { type: 'string' },
  },
} as const;

const gitTrackingComparisonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['reference', 'ahead', 'behind'],
  properties: {
    reference: { type: 'string' },
    ahead: { type: 'integer', minimum: 0 },
    behind: { type: 'integer', minimum: 0 },
  },
} as const;

const projectGitWorkspaceSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['branches', 'remotes'],
  properties: {
    branches: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'shortName', 'kind', 'current', 'ahead', 'behind'],
        properties: {
          name: { type: 'string' },
          shortName: { type: 'string' },
          kind: { type: 'string', enum: ['local', 'remote'] },
          current: { type: 'boolean' },
          remote: { type: 'string' },
          upstream: { type: 'string' },
          ahead: { type: 'integer', minimum: 0 },
          behind: { type: 'integer', minimum: 0 },
          latestCommit: gitCommitSchema,
        },
      },
    },
    remotes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'fetchUrl', 'pushUrl', 'role'],
        properties: {
          name: { type: 'string' },
          fetchUrl: { type: 'string' },
          pushUrl: { type: 'string' },
          role: { type: 'string', enum: ['origin', 'upstream', 'other'] },
        },
      },
    },
    originComparison: gitTrackingComparisonSchema,
    upstreamComparison: gitTrackingComparisonSchema,
  },
} as const;

const trackingConfirmationBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['remoteBranch'],
  properties: {
    remoteBranch: { type: 'string', minLength: 3, maxLength: 300 },
  },
} as const;

const trackingMutationBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['remoteBranch', 'confirmationToken'],
  properties: {
    remoteBranch: { type: 'string', minLength: 3, maxLength: 300 },
    confirmationToken: { type: 'string', minLength: 64, maxLength: 64 },
  },
} as const;

const trackingConfirmationResponseSchema = {
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
        operation: { type: 'string', enum: ['track-branch'] },
        target: { type: 'string' },
        expiresAt: { type: 'string' },
      },
    },
  },
} as const;

function findProject(options: GitWorkspaceRouteOptions, projectId: string) {
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

function translateBranchError(error: unknown): never {
  if (error instanceof GitBranchServiceError) {
    const statusByCode: Record<GitBranchServiceError['code'], number> = {
      GIT_BRANCH_INVALID: 400,
      GIT_BRANCH_EXISTS: 409,
      GIT_BRANCH_NOT_FOUND: 404,
      GIT_WORKING_TREE_DIRTY: 409,
      GIT_MUTATION_CONFIRMATION_REQUIRED: 409,
      GIT_REMOTE_NOT_CONFIGURED: 409,
      GIT_COMMAND_FAILED: 500,
    };
    const apiCodeByCode: Record<GitBranchServiceError['code'], ApiErrorCode> = {
      GIT_BRANCH_INVALID: 'GIT_BRANCH_INVALID',
      GIT_BRANCH_EXISTS: 'GIT_BRANCH_EXISTS',
      GIT_BRANCH_NOT_FOUND: 'GIT_BRANCH_NOT_FOUND',
      GIT_WORKING_TREE_DIRTY: 'GIT_WORKING_TREE_DIRTY',
      GIT_MUTATION_CONFIRMATION_REQUIRED: 'GIT_MUTATION_CONFIRMATION_REQUIRED',
      GIT_REMOTE_NOT_CONFIGURED: 'GIT_REMOTE_NOT_CONFIGURED',
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
      : 'Não foi possível criar a branch local.',
  });
}

export const gitWorkspaceRoutes: FastifyPluginAsync<
  GitWorkspaceRouteOptions
> = async (app, options) => {
  const workspaceService = new GitWorkspaceService();
  const branchService = new GitBranchService();

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

  app.post<{ Params: ProjectParams; Body: { remoteBranch: string } }>(
    '/projects/:projectId/git/branches/track/confirmations',
    {
      schema: {
        params: projectParamsSchema,
        body: trackingConfirmationBodySchema,
        response: {
          201: trackingConfirmationResponseSchema,
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      const project = findProject(options, request.params.projectId);
      try {
        return reply.code(201).send({
          confirmation: branchService.prepareTrackingConfirmation(
            project.id,
            request.body.remoteBranch,
          ),
        });
      } catch (error) {
        translateBranchError(error);
      }
    },
  );

  app.post<{
    Params: ProjectParams;
    Body: { remoteBranch: string; confirmationToken: string };
  }>(
    '/projects/:projectId/git/branches/track',
    {
      schema: {
        params: projectParamsSchema,
        body: trackingMutationBodySchema,
        response: {
          201: {
            type: 'object',
            additionalProperties: false,
            required: ['branch'],
            properties: { branch: gitBranchMutationResponseSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      const project = findProject(options, request.params.projectId);
      try {
        return reply.code(201).send({
          branch: await branchService.trackRemoteBranch(
            project.path,
            project.id,
            request.body.remoteBranch,
            request.body.confirmationToken,
          ),
        });
      } catch (error) {
        translateBranchError(error);
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
};
