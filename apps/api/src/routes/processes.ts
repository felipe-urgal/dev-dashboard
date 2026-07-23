import type { FastifyPluginAsync } from 'fastify';

import {
  ProcessManager,
  ProcessManagerError,
} from '@dev-dashboard/process-manager';

import { findProject } from '../store/project-store.js';

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

function processErrorStatus(
  error: ProcessManagerError,
): 400 | 404 | 409 {
  switch (error.code) {
    case 'PROCESS_NOT_FOUND':
      return 404;

    case 'PROCESS_ALREADY_RUNNING':
    case 'PROCESS_IDENTITY_MISMATCH':
    case 'PROCESS_STOP_TIMEOUT':
      return 409;

    default:
      return 400;
  }
}

export const processRoutes: FastifyPluginAsync = async (app) => {
  app.get<{
    Params: ProjectParams;
  }>('/projects/:projectId/process', async (request, reply) => {
    const project = findProject(request.params.projectId);

    if (!project) {
      return reply.code(404).send({
        error: 'PROJECT_NOT_FOUND',
        message: 'Projeto não encontrado.',
      });
    }

    const managedProcess = await processManager.getServerProcess(
      project.id,
    );

    return {
      process: managedProcess,
    };
  });

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
      },
    },
    async (request, reply) => {
      const project = findProject(request.params.projectId);

      if (!project) {
        return reply.code(404).send({
          error: 'PROJECT_NOT_FOUND',
          message: 'Projeto não encontrado.',
        });
      }

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
          return reply.code(processErrorStatus(error)).send({
            error: error.code,
            message: error.message,
          });
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
      },
    },
    async (request, reply) => {
      const project = findProject(request.params.projectId);

      if (!project) {
        return reply.code(404).send({
          error: 'PROJECT_NOT_FOUND',
          message: 'Projeto não encontrado.',
        });
      }

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
          return reply.code(processErrorStatus(error)).send({
            error: error.code,
            message: error.message,
          });
        }

        request.log.error(
          {
            error,
            projectId: project.id,
          },
          'Server start failed',
        );

        return reply.code(500).send({
          error: 'PROCESS_START_FAILED',
          message:
            error instanceof Error
              ? error.message
              : 'Não foi possível iniciar o servidor.',
        });
      }
    },
  );

  app.post<{
    Params: ProjectParams;
  }>('/projects/:projectId/process/stop', async (request, reply) => {
    const project = findProject(request.params.projectId);

    if (!project) {
      return reply.code(404).send({
        error: 'PROJECT_NOT_FOUND',
        message: 'Projeto não encontrado.',
      });
    }

    try {
      const managedProcess = await processManager.stopServer(
        project.id,
      );

      return {
        process: managedProcess,
      };
    } catch (error) {
      if (error instanceof ProcessManagerError) {
        return reply.code(processErrorStatus(error)).send({
          error: error.code,
          message: error.message,
        });
      }

      throw error;
    }
  });
};
