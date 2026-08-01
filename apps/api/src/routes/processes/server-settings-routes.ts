import type { FastifyInstance } from 'fastify';

import { ProjectServerSettingsError } from '@dev-dashboard/process-manager';

import {
  commonErrorResponseSchemas,
  projectServerSettingsResponseSchema,
} from '../../http/response-schemas.js';
import {
  projectParamsSchema,
  requireProject,
  serverSettingsApiError,
  type ProcessRouteOptions,
  type ProjectParams,
  type SaveServerSettingsBody,
} from './helpers.js';

export function registerServerSettingsRoutes(
  app: FastifyInstance,
  options: ProcessRouteOptions,
): void {
  const { serverSettingsRepository, projectStore } = options;

  app.get<{
    Params: ProjectParams;
  }>(
    '/projects/:projectId/server-settings',
    {
      schema: {
        params: projectParamsSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['settings'],
            properties: {
              settings:
                projectServerSettingsResponseSchema,
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = requireProject(
        projectStore,
        request.params.projectId,
      );

      return {
        settings:
          await serverSettingsRepository.find(
            project.id,
          ),
      };
    },
  );

  app.put<{
    Params: ProjectParams;
    Body: SaveServerSettingsBody;
  }>(
    '/projects/:projectId/server-settings',
    {
      schema: {
        params: projectParamsSchema,
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            port: {
              anyOf: [
                {
                  type: 'integer',
                  minimum: 1_024,
                  maximum: 65_535,
                },
                {
                  type: 'null',
                },
              ],
            },
          },
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['settings'],
            properties: {
              settings:
                projectServerSettingsResponseSchema,
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = requireProject(
        projectStore,
        request.params.projectId,
      );

      try {
        const settings =
          await serverSettingsRepository.save(
            project.id,
            {
              ...(request.body.port !== undefined &&
              request.body.port !== null
                ? {
                    port: request.body.port,
                  }
                : {}),
            },
          );

        return {
          settings,
        };
      } catch (error) {
        if (
          error instanceof ProjectServerSettingsError
        ) {
          throw serverSettingsApiError(error);
        }

        throw error;
      }
    },
  );
}
