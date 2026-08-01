import type { FastifyInstance } from 'fastify';

import {
  commonErrorResponseSchemas,
  testExecutionHistoryClearResponseSchema,
  testExecutionHistoryResponseSchema,
} from '../../http/response-schemas.js';
import {
  projectParamsSchema,
  requireProject,
  type ProjectParams,
  type TestHistoryQuery,
  type TestRouteOptions,
} from './helpers.js';

export function registerTestHistoryRoutes(
  app: FastifyInstance,
  options: TestRouteOptions,
): void {
  const { projectStore, testExecutionHistoryService } = options;

  app.get<{ Params: ProjectParams; Querystring: TestHistoryQuery }>(
    '/projects/:projectId/tests/history',
    {
      schema: {
        params: projectParamsSchema,
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            page: { type: 'integer', minimum: 1 },
            pageSize: { type: 'integer', minimum: 1, maximum: 100 },
          },
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['history'],
            properties: { history: testExecutionHistoryResponseSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = requireProject(projectStore, request.params.projectId);
      const history = await testExecutionHistoryService.history(
        project.id,
        request.query.page,
        request.query.pageSize,
      );
      return { history };
    },
  );

  app.delete<{ Params: ProjectParams }>(
    '/projects/:projectId/tests/history',
    {
      schema: {
        params: projectParamsSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['history'],
            properties: { history: testExecutionHistoryClearResponseSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = requireProject(projectStore, request.params.projectId);
      const history = await testExecutionHistoryService.clear(project.id);
      return { history };
    },
  );
}
