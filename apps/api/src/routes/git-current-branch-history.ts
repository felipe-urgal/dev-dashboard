import type {
  FastifyPluginAsync,
  FastifyPluginOptions,
} from 'fastify';

import { ApiError } from '../http/api-error.js';
import { commonErrorResponseSchemas } from '../http/response-schemas.js';
import {
  CurrentBranchHistoryError,
  listCurrentBranchOnlyCommits,
} from '../services/git-current-branch-history-service.js';
import type { ProjectStore } from '../store/project-store.js';

interface GitCurrentBranchHistoryRouteOptions extends FastifyPluginOptions {
  projectStore: ProjectStore;
}

interface ProjectParams {
  projectId: string;
}

interface HistoryQuery {
  page?: number;
  pageSize?: number;
  search?: string;
}

const projectParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId'],
  properties: {
    projectId: { type: 'string', minLength: 1 },
  },
} as const;

const historyQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    page: { type: 'integer', minimum: 1, default: 1 },
    pageSize: { type: 'integer', minimum: 1, maximum: 10, default: 10 },
    search: { type: 'string', maxLength: 200 },
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

export const gitCurrentBranchHistoryRoutes: FastifyPluginAsync<
  GitCurrentBranchHistoryRouteOptions
> = async (app, options) => {
  app.get<{ Params: ProjectParams; Querystring: HistoryQuery }>(
    '/projects/:projectId/git/current-branch-commits',
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
          history: await listCurrentBranchOnlyCommits(project.path, {
            page: request.query.page ?? 1,
            pageSize: request.query.pageSize ?? 10,
            ...(request.query.search !== undefined
              ? { search: request.query.search }
              : {}),
          }),
        };
      } catch (error) {
        if (error instanceof CurrentBranchHistoryError) {
          throw new ApiError({
            statusCode: 400,
            code: error.code,
            message: error.message,
          });
        }

        throw new ApiError({
          statusCode: 500,
          code: 'GIT_COMMAND_FAILED',
          message: error instanceof Error
            ? error.message
            : 'Não foi possível consultar os commits exclusivos da branch atual.',
        });
      }
    },
  );
};
