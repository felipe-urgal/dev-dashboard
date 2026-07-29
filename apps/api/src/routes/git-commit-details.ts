import type {
  FastifyPluginAsync,
  FastifyPluginOptions,
} from 'fastify';

import { ApiError } from '../http/api-error.js';
import type { ProjectStore } from '../store/project-store.js';
import {
  GitCommitDetailsError,
  inspectGitCommit,
} from '../services/git-commit-details-service.js';

interface GitCommitDetailsRouteOptions extends FastifyPluginOptions {
  projectStore: ProjectStore;
}

interface CommitParams {
  projectId: string;
  commitHash: string;
}

const paramsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId', 'commitHash'],
  properties: {
    projectId: { type: 'string', minLength: 1 },
    commitHash: {
      type: 'string',
      minLength: 7,
      maxLength: 40,
      pattern: '^[0-9a-fA-F]+$',
    },
  },
} as const;

const commitFileSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['path', 'status', 'additions', 'deletions', 'binary'],
  properties: {
    path: { type: 'string' },
    previousPath: { type: 'string' },
    status: {
      type: 'string',
      enum: ['added', 'modified', 'deleted', 'renamed', 'copied', 'type-changed'],
    },
    additions: { type: 'integer', minimum: 0 },
    deletions: { type: 'integer', minimum: 0 },
    binary: { type: 'boolean' },
  },
} as const;

const responseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['detail'],
  properties: {
    detail: {
      type: 'object',
      additionalProperties: false,
      required: [
        'hash',
        'shortHash',
        'subject',
        'body',
        'authorName',
        'authorEmail',
        'authoredAt',
        'files',
        'additions',
        'deletions',
        'patch',
        'truncated',
        'masked',
        'redactionCount',
      ],
      properties: {
        hash: { type: 'string' },
        shortHash: { type: 'string' },
        subject: { type: 'string' },
        body: { type: 'string' },
        authorName: { type: 'string' },
        authorEmail: { type: 'string' },
        authoredAt: { type: 'string' },
        files: { type: 'array', items: commitFileSchema },
        additions: { type: 'integer', minimum: 0 },
        deletions: { type: 'integer', minimum: 0 },
        patch: { type: 'string' },
        truncated: { type: 'boolean' },
        masked: { type: 'boolean' },
        redactionCount: { type: 'integer', minimum: 0 },
      },
    },
  },
} as const;

export const gitCommitDetailsRoutes: FastifyPluginAsync<
  GitCommitDetailsRouteOptions
> = async (app, options) => {
  app.get<{ Params: CommitParams }>(
    '/projects/:projectId/git/commits/:commitHash',
    {
      schema: {
        params: paramsSchema,
        response: {
          200: responseSchema,
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
          detail: await inspectGitCommit(project.path, request.params.commitHash),
        };
      } catch (error) {
        if (error instanceof GitCommitDetailsError) {
          const code = error.code === 'GIT_COMMIT_INVALID'
            ? 'GIT_REFERENCE_INVALID'
            : error.code === 'GIT_COMMIT_NOT_FOUND'
              ? 'GIT_REFERENCE_NOT_FOUND'
              : 'GIT_NOT_REPOSITORY';
          throw new ApiError({
            statusCode: error.code === 'GIT_COMMIT_NOT_FOUND' ? 404 : 400,
            code,
            message: error.message,
          });
        }

        throw new ApiError({
          statusCode: 500,
          code: 'GIT_COMMAND_FAILED',
          message: error instanceof Error
            ? error.message
            : 'Não foi possível inspecionar o commit.',
        });
      }
    },
  );
};
