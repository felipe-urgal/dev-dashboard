import type {
  FastifyPluginAsync,
} from 'fastify';

import {
  findProject,
  listProjects,
} from '../store/project-store.js';

import { ApiError } from '../http/api-error.js';

import {
  commonErrorResponseSchemas,
  projectResponseSchema,
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

export const projectRoutes: FastifyPluginAsync = async (app) => {
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
      projects: listProjects(),
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
      const project = findProject(request.params.projectId);

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

};
