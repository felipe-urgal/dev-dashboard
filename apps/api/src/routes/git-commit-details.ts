import type {
  FastifyPluginAsync,
  FastifyPluginOptions,
} from 'fastify';

import { ApiError } from '../http/api-error.js';
import { commonErrorResponseSchemas } from '../http/response-schemas.js';
import type { ProjectStore } from '../store/project-store.js';
import {
  GitCommitDetailsError,
  inspectGitCommit,
  listBranchCommits,
  type GitCommitHistoryKind,
} from '../services/git-commit-details-service.js';

interface GitCommitDetailsRouteOptions extends FastifyPluginOptions {
  projectStore: ProjectStore;
}

interface ProjectParams {
  projectId: string;
}

interface CommitParams extends ProjectParams {
  commitHash: string;
}

interface HistoryQuery {
  ref?: string;
  page?: number;
  pageSize?: number;
  search?: string;
  author?: string;
  kind?: GitCommitHistoryKind;
}

const projectParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId'],
  properties: { projectId: { type: 'string', minLength: 1 } },
} as const;

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

const historyQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ref: {
      type: 'string',
      minLength: 1,
      maxLength: 250,
      pattern: '^(?!-)[^\\u0000-\\u001F\\u007F]+$',
    },
    page: { type: 'integer', minimum: 1, default: 1 },
    pageSize: { type: 'integer', minimum: 1, maximum: 10, default: 10 },
    search: { type: 'string', maxLength: 200 },
    author: { type: 'string', maxLength: 320 },
    kind: { type: 'string', enum: ['all', 'regular', 'merge'], default: 'all' },
  },
} as const;

const commitSummarySchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'hash',
    'shortHash',
    'subject',
    'authorName',
    'authorEmail',
    'authoredAt',
    'parentCount',
  ],
  properties: {
    hash: { type: 'string' },
    shortHash: { type: 'string' },
    subject: { type: 'string' },
    authorName: { type: 'string' },
    authorEmail: { type: 'string' },
    authoredAt: { type: 'string' },
    parentCount: { type: 'integer', minimum: 0 },
  },
} as const;

const historySchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'branch',
    'page',
    'pageSize',
    'total',
    'totalPages',
    'commits',
  ],
  properties: {
    branch: { type: 'string' },
    page: { type: 'integer', minimum: 1 },
    pageSize: { type: 'integer', minimum: 1, maximum: 10 },
    total: { type: 'integer', minimum: 0 },
    totalPages: { type: 'integer', minimum: 0 },
    commits: { type: 'array', items: commitSummarySchema },
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

function translateCommitError(error: unknown): never {
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
      : 'Não foi possível consultar o histórico Git.',
  });
}

export const gitCommitDetailsRoutes: FastifyPluginAsync<
  GitCommitDetailsRouteOptions
> = async (app, options) => {
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

  app.get<{ Params: ProjectParams; Querystring: HistoryQuery }>(
    '/projects/:projectId/git/commits',
    {
      schema: {
        params: projectParamsSchema,
        querystring: historyQuerySchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['history'],
            properties: { history: historySchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = projectFor(request.params.projectId);
      try {
        return {
          history: await listBranchCommits(
            project.path,
            request.query.ref,
            request.query.page ?? 1,
            request.query.pageSize ?? 10,
            {
              ...(request.query.search !== undefined
                ? { search: request.query.search }
                : {}),
              ...(request.query.author !== undefined
                ? { author: request.query.author }
                : {}),
              kind: request.query.kind ?? 'all',
            },
          ),
        };
      } catch (error) {
        translateCommitError(error);
      }
    },
  );

  app.get<{ Params: CommitParams }>(
    '/projects/:projectId/git/commits/:commitHash',
    {
      schema: {
        params: paramsSchema,
        response: {
          200: responseSchema,
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = projectFor(request.params.projectId);
      try {
        return {
          detail: await inspectGitCommit(project.path, request.params.commitHash),
        };
      } catch (error) {
        translateCommitError(error);
      }
    },
  );
};
