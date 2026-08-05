import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';

import { ApiError } from '../http/api-error.js';
import { commonErrorResponseSchemas, projectEnvironmentOverviewResponseSchema } from '../http/response-schemas.js';
import type { ProjectEnvironmentService } from '../services/project-environment-service.js';
import type { ProjectStore } from '../store/project-store.js';

interface Options extends FastifyPluginOptions {
  projectStore: ProjectStore;
  projectEnvironmentService: ProjectEnvironmentService;
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

export const projectEnvironmentRoutes: FastifyPluginAsync<Options> = async (app, options) => {
  app.get<{ Params: Params }>('/projects/:projectId/environment-variables', {
    schema: {
      params: paramsSchema,
      response: {
        200: {
          type: 'object', additionalProperties: false, required: ['environment'],
          properties: { environment: projectEnvironmentOverviewResponseSchema },
        },
        ...commonErrorResponseSchemas,
      },
    },
  }, async (request) => ({
    environment: await options.projectEnvironmentService.getOverview(
      requireProject(options.projectStore, request.params.projectId),
    ),
  }));
};
