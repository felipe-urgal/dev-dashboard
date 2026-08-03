import type { FastifyInstance } from 'fastify';

import { ProjectServerSettingsError } from '@dev-dashboard/process-manager';

import {
  commonErrorResponseSchemas,
  projectServerHealthResponseSchema,
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
  const {
    processManager,
    serverHealthCheckService,
    serverSettingsRepository,
    projectStore,
  } = options;

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
            healthCheckPath: {
              anyOf: [
                {
                  type: 'string',
                  minLength: 1,
                  maxLength: 128,
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
              ...(request.body.healthCheckPath !== undefined &&
              request.body.healthCheckPath !== null
                ? {
                    healthCheckPath:
                      request.body.healthCheckPath,
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

  app.get<{
    Params: ProjectParams;
  }>(
    '/projects/:projectId/server-health',
    {
      schema: {
        params: projectParamsSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['health'],
            properties: {
              health: projectServerHealthResponseSchema,
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
      const [process, settings] = await Promise.all([
        processManager.getServerProcess(project.id),
        serverSettingsRepository.find(project.id),
      ]);
      const port = process?.port ?? settings.port;

      if (
        process?.status !== 'running' ||
        port === undefined
      ) {
        return {
          health: {
            projectId: project.id,
            path: settings.healthCheckPath ?? '/',
            pathSource: settings.healthCheckPath
              ? 'configured' as const
              : 'detected' as const,
            status: 'unavailable' as const,
            checkedAt: new Date().toISOString(),
            message:
              'O servidor precisa estar em execução para verificar a saúde.',
          },
        };
      }

      return {
        health: await serverHealthCheckService.check({
          projectId: project.id,
          port,
          ...(settings.healthCheckPath
            ? { healthCheckPath: settings.healthCheckPath }
            : {}),
        }),
      };
    },
  );
}
