import type { FastifyInstance } from 'fastify';

import {
  ProcessManagerError,
  ProjectServerSettingsError,
} from '@dev-dashboard/process-manager';

import { ApiError } from '../../http/api-error.js';
import {
  commonErrorResponseSchemas,
  managedProcessResponseSchema,
  nullableManagedProcessResponseSchema,
  processLogSnapshotResponseSchema,
} from '../../http/response-schemas.js';
import {
  processEnvelopeResponseSchema,
  processManagerApiError,
  projectParamsSchema,
  requireProject,
  serverSettingsApiError,
  type ProcessLogQuery,
  type ProcessRouteOptions,
  type ProjectParams,
  type StartProcessBody,
} from './helpers.js';

export function registerServerProcessRoutes(
  app: FastifyInstance,
  options: ProcessRouteOptions,
): void {
  const { processManager, serverSettingsRepository, projectStore } = options;

  app.get<{
    Params: ProjectParams;
  }>(
    '/projects/:projectId/process',
    {
      schema: {
        params: projectParamsSchema,
        response: {
          200: processEnvelopeResponseSchema(
            nullableManagedProcessResponseSchema,
          ),
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = requireProject(
        projectStore,
        request.params.projectId,
      );

      const managedProcess =
        await processManager.getServerProcess(
          project.id,
        );

      return {
        process: managedProcess,
      };
    },
  );

  app.get<{
    Params: ProjectParams;
    Querystring: ProcessLogQuery;
  }>(
    '/projects/:projectId/process/logs',
    {
      schema: {
        params: projectParamsSchema,
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            maxBytes: {
              type: 'integer',
              minimum: 1,
              maximum: 262_144,
            },
          },
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['log'],
            properties: {
              log: processLogSnapshotResponseSchema,
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
        const log = await processManager.readServerLog(
          project.id,
          {
            ...(request.query.maxBytes !== undefined
              ? {
                  maxBytes: request.query.maxBytes,
                }
              : {}),
          },
        );

        return {
          log,
        };
      } catch (error) {
        if (error instanceof ProcessManagerError) {
          throw processManagerApiError(error);
        }

        throw error;
      }
    },
  );

  app.delete<{
    Params: ProjectParams;
  }>(
    '/projects/:projectId/process/logs',
    {
      schema: {
        params: projectParamsSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['log'],
            properties: {
              log: processLogSnapshotResponseSchema,
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
        return {
          log: await processManager.clearServerLog(
            project.id,
          ),
        };
      } catch (error) {
        if (error instanceof ProcessManagerError) {
          throw processManagerApiError(error);
        }

        throw error;
      }
    },
  );

  app.post<{
    Params: ProjectParams;
    Body: StartProcessBody;
  }>(
    '/projects/:projectId/process/start',
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
          201: processEnvelopeResponseSchema(
            managedProcessResponseSchema,
          ),
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      const project = requireProject(
        projectStore,
        request.params.projectId,
      );

      try {
        let settings =
          await serverSettingsRepository.find(
            project.id,
          );

        if (request.body.port !== undefined) {
          settings =
            await serverSettingsRepository.save(
              project.id,
              {
                ...(request.body.port !== null
                  ? { port: request.body.port }
                  : {}),
                ...(settings.healthCheckPath
                  ? {
                      healthCheckPath:
                        settings.healthCheckPath,
                    }
                  : {}),
              },
            );
        }

        const managedProcess =
          await processManager.startServer(
            project,
            {
              ...(settings.port !== undefined
                ? {
                    port: settings.port,
                  }
                : {}),
            },
          );

        return reply.code(201).send({
          process: managedProcess,
        });
      } catch (error) {
        if (error instanceof ProcessManagerError) {
          throw processManagerApiError(error);
        }

        if (
          error instanceof ProjectServerSettingsError
        ) {
          throw serverSettingsApiError(error);
        }

        request.log.error(
          {
            err: error,
            projectId: project.id,
          },
          'Server start failed',
        );

        throw new ApiError({
          statusCode: 500,
          code: 'PROCESS_START_FAILED',
          message:
            'Não foi possível iniciar o servidor.',
        });
      }
    },
  );

  app.post<{
    Params: ProjectParams;
  }>(
    '/projects/:projectId/process/stop',
    {
      schema: {
        params: projectParamsSchema,
        response: {
          200: processEnvelopeResponseSchema(
            managedProcessResponseSchema,
          ),
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
        const managedProcess =
          await processManager.stopServer(
            project.id,
          );

        return {
          process: managedProcess,
        };
      } catch (error) {
        if (error instanceof ProcessManagerError) {
          throw processManagerApiError(error);
        }

        throw error;
      }
    },
  );
}
