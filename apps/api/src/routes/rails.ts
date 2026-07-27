import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';

import { ApiError } from '../http/api-error.js';
import {
  commonErrorResponseSchemas,
  railsMigrationsOverviewResponseSchema,
  railsRoutesOverviewResponseSchema,
} from '../http/response-schemas.js';
import type { RailsInspectionService } from '../services/rails-inspection-service.js';
import type { ProjectStore } from '../store/project-store.js';

interface Options extends FastifyPluginOptions {
  projectStore: ProjectStore;
  railsInspectionService: RailsInspectionService;
}

interface Params {
  projectId: string;
}

const paramsSchema = {
  type: 'object', additionalProperties: false, required: ['projectId'],
  properties: { projectId: { type: 'string', minLength: 1 } },
} as const;

function requireProject(store: ProjectStore, id: string) {
  const project = store.findProject(id);
  if (!project) throw new ApiError({ statusCode: 404, code: 'PROJECT_NOT_FOUND', message: 'Projeto não encontrado.' });
  return project;
}

export const railsRoutes: FastifyPluginAsync<Options> = async (app, options) => {
  app.get<{ Params: Params }>('/projects/:projectId/rails/migrations', {
    schema: {
      params: paramsSchema,
      response: {
        200: {
          type: 'object', additionalProperties: false, required: ['migrations'],
          properties: { migrations: railsMigrationsOverviewResponseSchema },
        },
        ...commonErrorResponseSchemas,
      },
    },
  }, async (request) => ({
    migrations: await options.railsInspectionService.getMigrationsOverview(
      requireProject(options.projectStore, request.params.projectId),
    ),
  }));

  app.get<{ Params: Params }>('/projects/:projectId/rails/routes', {
    schema: {
      params: paramsSchema,
      response: {
        200: {
          type: 'object', additionalProperties: false, required: ['routes'],
          properties: { routes: railsRoutesOverviewResponseSchema },
        },
        ...commonErrorResponseSchemas,
      },
    },
  }, async (request) => ({
    routes: await options.railsInspectionService.getRoutesOverview(
      requireProject(options.projectStore, request.params.projectId),
    ),
  }));
};
