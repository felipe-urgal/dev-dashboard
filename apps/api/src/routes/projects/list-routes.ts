import type { FastifyInstance } from 'fastify';

import { ApiError } from '../../http/api-error.js';
import {
  commonErrorResponseSchemas,
  projectResponseSchema,
} from '../../http/response-schemas.js';
import {
  projectParamsSchema,
  type ProjectParams,
  type ProjectRouteOptions,
} from './helpers.js';

export function registerProjectListRoutes(
  app: FastifyInstance,
  options: ProjectRouteOptions,
): void {
  const { projectStore } = options;

  app.get(
    '/projects',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['projects'],
            properties: {
              projects: {
                type: 'array',
                items: projectResponseSchema,
              },
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async () => ({
      projects: projectStore.listProjects(),
    }),
  );

  app.get<{
    Params: ProjectParams;
  }>(
    '/projects/:projectId',
    {
      schema: {
        params: projectParamsSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['project'],
            properties: {
              project: projectResponseSchema,
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = projectStore.findProject(
        request.params.projectId,
      );

      if (!project) {
        throw new ApiError({
          statusCode: 404,
          code: 'PROJECT_NOT_FOUND',
          message: 'Projeto não encontrado.',
        });
      }

      return {
        project,
      };
    },
  );
}
