import type { FastifyInstance } from 'fastify';
import {
  ProjectDisabledRepositoryError,
  ProjectFavoriteRepositoryError,
} from '@dev-dashboard/core';

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
  const { projectFavoriteRepository, projectDisabledRepository, projectStore } =
    options;

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
      const project = projectStore.findProject(request.params.projectId);

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

  app.post<{
    Params: ProjectParams;
    Body: Record<string, never>;
  }>(
    '/projects/:projectId/access',
    {
      schema: {
        params: projectParamsSchema,
        body: {
          type: 'object',
          additionalProperties: false,
          maxProperties: 0,
        },
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
      const updatedProject = await projectStore.recordAccess(
        request.params.projectId,
      );

      if (!updatedProject) {
        throw new ApiError({
          statusCode: 404,
          code: 'PROJECT_NOT_FOUND',
          message: 'Projeto não encontrado.',
        });
      }

      return { project: updatedProject };
    },
  );

  app.put<{
    Params: ProjectParams;
    Body: {
      favorite: boolean;
    };
  }>(
    '/projects/:projectId/favorite',
    {
      schema: {
        params: projectParamsSchema,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['favorite'],
          properties: {
            favorite: {
              type: 'boolean',
            },
          },
        },
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
      const project = projectStore.findProject(request.params.projectId);

      if (!project) {
        throw new ApiError({
          statusCode: 404,
          code: 'PROJECT_NOT_FOUND',
          message: 'Projeto não encontrado.',
        });
      }

      try {
        await projectFavoriteRepository.set(project.id, request.body.favorite);
      } catch (error) {
        if (
          error instanceof ProjectFavoriteRepositoryError &&
          error.code === 'PROJECT_FAVORITES_LIMIT_REACHED'
        ) {
          throw new ApiError({
            statusCode: 409,
            code: error.code,
            message: error.message,
          });
        }

        throw error;
      }

      const updatedProject = projectStore.setFavorite(
        project.id,
        request.body.favorite,
      );

      if (!updatedProject) {
        throw new ApiError({
          statusCode: 404,
          code: 'PROJECT_NOT_FOUND',
          message: 'Projeto não encontrado.',
        });
      }

      return {
        project: updatedProject,
      };
    },
  );

  app.put<{
    Params: ProjectParams;
    Body: {
      enabled: boolean;
    };
  }>(
    '/projects/:projectId/enabled',
    {
      schema: {
        params: projectParamsSchema,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['enabled'],
          properties: {
            enabled: {
              type: 'boolean',
            },
          },
        },
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
      const project = projectStore.findProject(request.params.projectId);

      if (!project) {
        throw new ApiError({
          statusCode: 404,
          code: 'PROJECT_NOT_FOUND',
          message: 'Projeto não encontrado.',
        });
      }

      try {
        await projectDisabledRepository.set(project.id, !request.body.enabled);
      } catch (error) {
        if (
          error instanceof ProjectDisabledRepositoryError &&
          error.code === 'PROJECT_DISABLED_LIMIT_REACHED'
        ) {
          throw new ApiError({
            statusCode: 409,
            code: error.code,
            message: error.message,
          });
        }

        throw error;
      }

      const updatedProject = projectStore.setEnabled(
        project.id,
        request.body.enabled,
      );

      if (!updatedProject) {
        throw new ApiError({
          statusCode: 404,
          code: 'PROJECT_NOT_FOUND',
          message: 'Projeto não encontrado.',
        });
      }

      return {
        project: updatedProject,
      };
    },
  );
}
