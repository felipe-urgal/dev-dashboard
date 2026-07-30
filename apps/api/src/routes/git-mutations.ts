import type {
  FastifyPluginAsync,
  FastifyPluginOptions,
} from 'fastify';

import type { ProjectStore } from '../store/project-store.js';
import { GitMutationError, type GitService } from '../services/git-service.js';

import { ApiError } from '../http/api-error.js';

import {
  commonErrorResponseSchemas,
  gitBranchMutationResponseSchema,
  gitCommitMutationResponseSchema,
  gitMutationConfirmationResponseSchema,
  gitStashPopResponseSchema,
  gitStashPushResponseSchema,
} from '../http/response-schemas.js';

interface ProjectParams {
  projectId: string;
}

const projectParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId'],
  properties: {
    projectId: {
      type: 'string',
      minLength: 1,
    },
  },
} as const;

interface GitMutationRouteOptions extends FastifyPluginOptions {
  projectStore: ProjectStore;
  gitService: GitService;
}

export const gitMutationRoutes: FastifyPluginAsync<
  GitMutationRouteOptions
> = async (app, options) => {
  const { projectStore, gitService } = options;

  const mutationConfirmationBodySchema = {
    type: 'object', additionalProperties: false, required: ['operation', 'target'],
    properties: {
      operation: { type: 'string', enum: ['create-branch', 'switch-branch', 'pull', 'push', 'commit', 'save', 'stash-push', 'stash-pop', 'discard-file', 'remove-untracked-file'] },
      target: { type: 'string', minLength: 1, maxLength: 4096 },
    },
  } as const;

  const mutationBodySchema = {
    type: 'object', additionalProperties: false, required: ['name', 'confirmationToken'],
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 200 },
      confirmationToken: { type: 'string', minLength: 64, maxLength: 64 },
    },
  } as const;

  const syncMutationBodySchema = {
    type: 'object', additionalProperties: false, required: ['confirmationToken'],
    properties: {
      confirmationToken: { type: 'string', minLength: 64, maxLength: 64 },
    },
  } as const;

  const saveBodySchema = {
    type: 'object', additionalProperties: false, required: ['message', 'confirmationToken'],
    properties: {
      message: { type: 'string', minLength: 1, maxLength: 500 },
      confirmationToken: { type: 'string', minLength: 64, maxLength: 64 },
    },
  } as const;

  const commitBodySchema = {
    type: 'object', additionalProperties: false, required: ['message', 'confirmationToken'],
    properties: {
      message: { type: 'string', minLength: 1, maxLength: 500 },
      includeAllChanges: { type: 'boolean' },
      confirmationToken: { type: 'string', minLength: 64, maxLength: 64 },
    },
  } as const;

  function translateMutationError(error: unknown): never {
    if (error instanceof GitMutationError) {
      const statuses: Record<string, number> = {
        GIT_NOT_REPOSITORY: 400,
        GIT_BRANCH_INVALID: 400,
        GIT_BRANCH_EXISTS: 409,
        GIT_BRANCH_NOT_FOUND: 404,
        GIT_WORKING_TREE_DIRTY: 409,
        GIT_MUTATION_CONFIRMATION_REQUIRED: 409,
        GIT_DETACHED_HEAD: 400,
        GIT_NO_UPSTREAM: 409,
        GIT_REMOTE_NOT_CONFIGURED: 409,
        GIT_PULL_DIVERGED: 409,
        GIT_PUSH_REJECTED: 409,
        GIT_REMOTE_UNAVAILABLE: 502,
        GIT_PULL_FAILED: 500,
        GIT_PUSH_FAILED: 500,
        GIT_COMMIT_MESSAGE_INVALID: 400,
        GIT_NOTHING_TO_COMMIT: 409,
        GIT_COMMIT_FAILED: 500,
        GIT_FILE_PATH_INVALID: 400,
        GIT_FILE_NOT_FOUND: 404,
        GIT_FILE_OPERATION_NOT_ALLOWED: 409,
        GIT_FILE_MUTATION_FAILED: 500,
        GIT_NOTHING_TO_STASH: 409,
        GIT_STASH_PUSH_FAILED: 500,
        GIT_STASH_EMPTY: 404,
        GIT_STASH_CONFLICT: 409,
        GIT_STASH_POP_FAILED: 500,
      };
      throw new ApiError({ statusCode: statuses[error.code] ?? 400, code: error.code, message: error.message });
    }
    throw new ApiError({
      statusCode: 500, code: 'GIT_COMMAND_FAILED',
      message: error instanceof Error ? error.message : 'Não foi possível concluir a operação Git.',
    });
  }

  app.post<{ Params: ProjectParams; Body: { operation: 'create-branch' | 'switch-branch' | 'pull' | 'push' | 'commit' | 'save' | 'stash-push' | 'stash-pop' | 'discard-file' | 'remove-untracked-file'; target: string } }>(
    '/projects/:projectId/git/mutations/confirmations',
    {
      schema: {
        params: projectParamsSchema,
        body: mutationConfirmationBodySchema,
        response: {
          201: {
            type: 'object', additionalProperties: false, required: ['confirmation'],
            properties: { confirmation: gitMutationConfirmationResponseSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      const project = projectStore.findProject(request.params.projectId);
      if (!project) throw new ApiError({ statusCode: 404, code: 'PROJECT_NOT_FOUND', message: 'Projeto não encontrado.' });
      try {
        return reply.code(201).send({
          confirmation: gitService.prepareMutationConfirmation(project.id, request.body.operation, request.body.target),
        });
      } catch (error) {
        translateMutationError(error);
      }
    },
  );

  app.post<{ Params: ProjectParams; Body: { name: string; confirmationToken: string } }>(
    '/projects/:projectId/git/branches',
    {
      schema: {
        params: projectParamsSchema,
        body: mutationBodySchema,
        response: {
          201: {
            type: 'object', additionalProperties: false, required: ['branch'],
            properties: { branch: gitBranchMutationResponseSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      const project = projectStore.findProject(request.params.projectId);
      if (!project) throw new ApiError({ statusCode: 404, code: 'PROJECT_NOT_FOUND', message: 'Projeto não encontrado.' });
      try {
        return reply.code(201).send({
          branch: await gitService.createBranch(project.path, project.id, request.body.name, request.body.confirmationToken),
        });
      } catch (error) {
        translateMutationError(error);
      }
    },
  );

  app.post<{ Params: ProjectParams; Body: { name: string; confirmationToken: string } }>(
    '/projects/:projectId/git/switch',
    {
      schema: {
        params: projectParamsSchema,
        body: mutationBodySchema,
        response: {
          200: {
            type: 'object', additionalProperties: false, required: ['branch'],
            properties: { branch: gitBranchMutationResponseSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = projectStore.findProject(request.params.projectId);
      if (!project) throw new ApiError({ statusCode: 404, code: 'PROJECT_NOT_FOUND', message: 'Projeto não encontrado.' });
      try {
        return { branch: await gitService.switchBranch(project.path, project.id, request.body.name, request.body.confirmationToken) };
      } catch (error) {
        translateMutationError(error);
      }
    },
  );

  app.post<{ Params: ProjectParams; Body: { confirmationToken: string } }>(
    '/projects/:projectId/git/pull',
    {
      schema: {
        params: projectParamsSchema,
        body: syncMutationBodySchema,
        response: {
          200: {
            type: 'object', additionalProperties: false, required: ['branch'],
            properties: { branch: gitBranchMutationResponseSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = projectStore.findProject(request.params.projectId);
      if (!project) throw new ApiError({ statusCode: 404, code: 'PROJECT_NOT_FOUND', message: 'Projeto não encontrado.' });
      try {
        return { branch: await gitService.pull(project.path, project.id, request.body.confirmationToken) };
      } catch (error) {
        translateMutationError(error);
      }
    },
  );

  app.post<{ Params: ProjectParams; Body: { confirmationToken: string } }>(
    '/projects/:projectId/git/push',
    {
      schema: {
        params: projectParamsSchema,
        body: syncMutationBodySchema,
        response: {
          200: {
            type: 'object', additionalProperties: false, required: ['branch'],
            properties: { branch: gitBranchMutationResponseSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = projectStore.findProject(request.params.projectId);
      if (!project) throw new ApiError({ statusCode: 404, code: 'PROJECT_NOT_FOUND', message: 'Projeto não encontrado.' });
      try {
        return { branch: await gitService.push(project.path, project.id, request.body.confirmationToken) };
      } catch (error) {
        translateMutationError(error);
      }
    },
  );

  app.post<{ Params: ProjectParams; Body: { message: string; includeAllChanges?: boolean; confirmationToken: string } }>(
    '/projects/:projectId/git/commit',
    {
      schema: {
        params: projectParamsSchema,
        body: commitBodySchema,
        response: {
          201: {
            type: 'object', additionalProperties: false, required: ['commit'],
            properties: { commit: gitCommitMutationResponseSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      const project = projectStore.findProject(request.params.projectId);
      if (!project) throw new ApiError({ statusCode: 404, code: 'PROJECT_NOT_FOUND', message: 'Projeto não encontrado.' });
      try {
        return reply.code(201).send({
          commit: await gitService.commit(project.path, project.id, request.body.message, request.body.includeAllChanges ?? false, request.body.confirmationToken),
        });
      } catch (error) {
        translateMutationError(error);
      }
    },
  );

  app.post<{ Params: ProjectParams; Body: { message: string; confirmationToken: string } }>(
    '/projects/:projectId/git/save',
    {
      schema: {
        params: projectParamsSchema,
        body: saveBodySchema,
        response: {
          201: {
            type: 'object', additionalProperties: false, required: ['commit'],
            properties: { commit: gitCommitMutationResponseSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      const project = projectStore.findProject(request.params.projectId);
      if (!project) throw new ApiError({ statusCode: 404, code: 'PROJECT_NOT_FOUND', message: 'Projeto não encontrado.' });
      try {
        return reply.code(201).send({
          commit: await gitService.save(project.path, project.id, request.body.message, request.body.confirmationToken),
        });
      } catch (error) {
        translateMutationError(error);
      }
    },
  );

  app.post<{ Params: ProjectParams; Body: { confirmationToken: string } }>(
    '/projects/:projectId/git/stash',
    {
      schema: {
        params: projectParamsSchema,
        body: syncMutationBodySchema,
        response: {
          201: gitStashPushResponseSchema,
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      const project = projectStore.findProject(request.params.projectId);
      if (!project) throw new ApiError({ statusCode: 404, code: 'PROJECT_NOT_FOUND', message: 'Projeto não encontrado.' });
      try {
        return reply.code(201).send(await gitService.stashPush(project.path, project.id, request.body.confirmationToken));
      } catch (error) {
        translateMutationError(error);
      }
    },
  );

  app.post<{ Params: ProjectParams; Body: { confirmationToken: string } }>(
    '/projects/:projectId/git/stash/pop',
    {
      schema: {
        params: projectParamsSchema,
        body: syncMutationBodySchema,
        response: {
          200: gitStashPopResponseSchema,
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = projectStore.findProject(request.params.projectId);
      if (!project) throw new ApiError({ statusCode: 404, code: 'PROJECT_NOT_FOUND', message: 'Projeto não encontrado.' });
      try {
        return await gitService.stashPop(project.path, project.id, request.body.confirmationToken);
      } catch (error) {
        translateMutationError(error);
      }
    },
  );
};
