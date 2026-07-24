import type { FastifyPluginAsync } from 'fastify';

import {
  ProcessManager,
  ProcessManagerError,
} from '@dev-dashboard/process-manager';

import { ApiError } from '../http/api-error.js';

import { findProject } from '../store/project-store.js';

import {
  managedProcessResponseSchema,
  nullableManagedProcessResponseSchema,
  processLogSnapshotResponseSchema,
} from '../http/response-schemas.js';

const processEnvelopeResponseSchema = (processSchema: object) => ({
  type: 'object',
  additionalProperties: false,
  required: ['process'],
  properties: {
    process: processSchema,
  },
});

interface ProjectParams {
  projectId: string;
}

interface StartProcessBody {
  port?: number;
}

interface ProcessLogQuery {
  maxBytes?: number;
}

const processManager = new ProcessManager();

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

function requireProject(projectId: string) {
  const project = findProject(projectId);

  if (!project) {
    throw new ApiError({
      statusCode: 404,
      code: 'PROJECT_NOT_FOUND',
      message: 'Projeto não encontrado.',
    });
  }

  return project;
}

export const processRoutes: FastifyPluginAsync = async (app) => {
  app.get<{
    Params: ProjectParams;
  }>(
    '/projects/:projectId/process',
    {
      schema: {
        response: {
          200: processEnvelopeResponseSchema(
            nullableManagedProcessResponseSchema,
          ),
        },
      },
    },
    async (request) => {
      const project = requireProject(request.params.projectId);

      const managedProcess = await processManager.getServerProcess(
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
        },
      },
    },
    async (request) => {
      const project = requireProject(request.params.projectId);

      try {
        const log = await processManager.readServerLog(project.id, {
          ...(request.query.maxBytes !== undefined
            ? {
                maxBytes: request.query.maxBytes,
              }
            : {}),
        });

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

  app.post<{
    Params: ProjectParams;
    Body: StartProcessBody;
  }>(
    '/projects/:projectId/process/start',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            port: {
              type: 'integer',
              minimum: 1,
              maximum: 65_535,
            },
          },
        },
        response: {
          201: processEnvelopeResponseSchema(
            managedProcessResponseSchema,
          ),
        },
      },
    },
    async (request, reply) => {
      const project = requireProject(request.params.projectId);

      try {
        const managedProcess = await processManager.startServer(
          project,
          {
            ...(request.body.port !== undefined
              ? {
                  port: request.body.port,
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

        request.log.error(
          {
            error,
            projectId: project.id,
          },
          'Server start failed',
        );

        throw new ApiError({
          statusCode: 500,
          code: 'PROCESS_START_FAILED',
          message: 'Não foi possível iniciar o servidor.',
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
        response: {
          200: processEnvelopeResponseSchema(
            managedProcessResponseSchema,
          ),
        },
      },
    },
    async (request) => {
      const project = requireProject(request.params.projectId);

      try {
        const managedProcess = await processManager.stopServer(
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
};
