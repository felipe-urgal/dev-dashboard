import type {
  FastifyPluginAsync,
  FastifyPluginOptions,
} from 'fastify';

import {
  ProcessManagerError,
  ProjectServerSettingsError,
  sweepStaleProcesses,
  type ProcessManager,
  type ProjectServerSettingsRepository,
} from '@dev-dashboard/process-manager';

import { ApiError } from '../http/api-error.js';

import type { ProjectStore } from '../store/project-store.js';

import {
  commonErrorResponseSchemas,
  logRetentionSweepResponseSchema,
  managedProcessResponseSchema,
  nullableManagedProcessResponseSchema,
  processLogSnapshotResponseSchema,
  projectServerSettingsResponseSchema,
} from '../http/response-schemas.js';

const processEnvelopeResponseSchema = (
  processSchema: object,
) => ({
  type: 'object',
  additionalProperties: false,
  required: ['process'],
  properties: {
    process: processSchema,
  },
});

interface ProcessRouteOptions extends FastifyPluginOptions {
  processManager: ProcessManager;
  serverSettingsRepository: ProjectServerSettingsRepository;
  projectStore: ProjectStore;
}

interface ProjectParams {
  projectId: string;
}

interface StartProcessBody {
  port?: number | null;
}

interface SaveServerSettingsBody {
  port?: number | null;
}

interface ProcessLogQuery {
  maxBytes?: number;
}

function processManagerApiError(
  error: ProcessManagerError,
): ApiError {
  switch (error.code) {
    case 'PROCESS_NOT_FOUND':
      return new ApiError({
        statusCode: 404,
        code: error.code,
        message: error.message,
      });

    case 'PROCESS_ALREADY_RUNNING':
    case 'PROCESS_IDENTITY_MISMATCH':
    case 'PROCESS_STOP_TIMEOUT':
    case 'PORT_NOT_AVAILABLE':
      return new ApiError({
        statusCode: 409,
        code: error.code,
        message: error.message,
      });

    default:
      return new ApiError({
        statusCode: 400,
        code: error.code,
        message: error.message,
      });
  }
}

function serverSettingsApiError(
  error: ProjectServerSettingsError,
): ApiError {
  return new ApiError({
    statusCode: 400,
    code: error.code,
    message: error.message,
  });
}

function requireProject(
  projectStore: ProjectStore,
  projectId: string,
) {
  const project = projectStore.findProject(projectId);

  if (!project) {
    throw new ApiError({
      statusCode: 404,
      code: 'PROJECT_NOT_FOUND',
      message: 'Projeto não encontrado.',
    });
  }

  return project;
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

export const processRoutes: FastifyPluginAsync<
  ProcessRouteOptions
> = async (app, options) => {
  const {
    processManager,
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
              request.body.port !== null
                ? { port: request.body.port }
                : {},
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

  app.post(
    '/processes/cleanup',
    {
      schema: {
        response: {
          200: logRetentionSweepResponseSchema,
          ...commonErrorResponseSchemas,
        },
      },
    },
    async () => {
      const removed = await sweepStaleProcesses(
        processManager.stateDirectory,
      );

      return {
        removed,
        removedCount: removed.length,
      };
    },
  );
};
