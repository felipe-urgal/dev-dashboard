import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';

import { ApiError } from '../http/api-error.js';
import {
  commonErrorResponseSchemas,
  projectDependencyUpgradePlanResponseSchema,
} from '../http/response-schemas.js';
import type { ProjectDependencyUpgradePlanService } from '../services/project-dependency-upgrade-plan-service.js';
import type { ProjectStore } from '../store/project-store.js';

interface Options extends FastifyPluginOptions {
  projectStore: ProjectStore;
  dependencyUpgradePlanService: Pick<
    ProjectDependencyUpgradePlanService,
    'inspect'
  >;
}

interface Params {
  projectId: string;
}

const paramsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId'],
  properties: {
    projectId: { type: 'string', minLength: 1 },
  },
} as const;

function requireProject(store: ProjectStore, projectId: string) {
  const project = store.findProject(projectId);
  if (!project) {
    throw new ApiError({
      statusCode: 404,
      code: 'PROJECT_NOT_FOUND',
      message: 'Projeto não encontrado.',
    });
  }
  return project;
}

export const dependencyUpgradePlanRoutes: FastifyPluginAsync<Options> = async (
  app,
  options,
) => {
  app.get<{ Params: Params }>(
    '/projects/:projectId/dependency-upgrade-plan',
    {
      schema: {
        params: paramsSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['plan'],
            properties: {
              plan: projectDependencyUpgradePlanResponseSchema,
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => ({
      plan: await options.dependencyUpgradePlanService.inspect(
        requireProject(options.projectStore, request.params.projectId),
      ),
    }),
  );
};
