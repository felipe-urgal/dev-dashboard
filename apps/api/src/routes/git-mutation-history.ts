import type {
  FastifyPluginAsync,
  FastifyPluginOptions,
} from 'fastify';

import type { ProjectStore } from '../store/project-store.js';
import type { GitMutationHistoryService } from '../services/git-mutation-history-service.js';

import { ApiError } from '../http/api-error.js';
import {
  commonErrorResponseSchemas,
  gitMutationHistoryPageResponseSchema,
} from '../http/response-schemas.js';

interface ProjectParams {
  projectId: string;
}

interface HistoryQuery {
  page?: number;
  pageSize?: number;
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
    page: { type: 'integer', minimum: 1 },
    pageSize: { type: 'integer', minimum: 1, maximum: 100 },
  },
} as const;

interface GitMutationHistoryRouteOptions extends FastifyPluginOptions {
  projectStore: ProjectStore;
  gitMutationHistoryService: GitMutationHistoryService;
}

/**
 * Rota paginada e autenticada para o histórico de resultados de mutações Git
 * de um projeto — nunca das leituras. Só é registrada em memória o que já
 * passou por `GitMutationHistoryService.record`, sempre metadados limitados
 * (ver `docs/architecture/security.md`).
 */
export const gitMutationHistoryRoutes: FastifyPluginAsync<GitMutationHistoryRouteOptions> = async (app, options) => {
  const { projectStore, gitMutationHistoryService } = options;

  app.get<{ Params: ProjectParams; Querystring: HistoryQuery }>(
    '/projects/:projectId/git/mutation-history',
    {
      schema: {
        params: projectParamsSchema,
        querystring: historyQuerySchema,
        response: {
          200: gitMutationHistoryPageResponseSchema,
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = projectStore.findProject(request.params.projectId);
      if (!project) {
        throw new ApiError({ statusCode: 404, code: 'PROJECT_NOT_FOUND', message: 'Projeto não encontrado.' });
      }
      return gitMutationHistoryService.history(
        project.id,
        request.query.page ?? 1,
        request.query.pageSize ?? 20,
      );
    },
  );
};
