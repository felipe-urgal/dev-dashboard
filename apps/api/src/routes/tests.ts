import type {
  FastifyPluginAsync,
  FastifyPluginOptions,
} from 'fastify';

import {
  ProcessManagerError,
  type ProcessManager,
} from '@dev-dashboard/process-manager';

import { ApiError } from '../http/api-error.js';
import type { ProjectStore } from '../store/project-store.js';
import type { TestDetectionService } from '../services/test-detection-service.js';

import {
  commonErrorResponseSchemas,
  managedProcessResponseSchema,
  nullableManagedProcessResponseSchema,
  processLogSnapshotResponseSchema,
  projectTestOverviewResponseSchema,
} from '../http/response-schemas.js';

interface ProjectParams {
  projectId: string;
}

interface TestCommandParams extends ProjectParams {
  commandId: string;
}

interface TestLogQuery {
  maxBytes?: number;
}

interface TestOverviewQuery {
  refresh?: boolean;
}

interface TestRouteOptions extends FastifyPluginOptions {
  processManager: ProcessManager;
  projectStore: ProjectStore;
  testDetectionService: TestDetectionService;
}

const projectParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId'],
  properties: {
    projectId: { type: 'string', minLength: 1 },
  },
} as const;

const testCommandParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId', 'commandId'],
  properties: {
    projectId: { type: 'string', minLength: 1 },
    commandId: { type: 'string', minLength: 1, maxLength: 80 },
  },
} as const;

const emptyBodySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {},
} as const;

const emptyQuerystringSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {},
} as const;

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

export const testRoutes: FastifyPluginAsync<TestRouteOptions> = async (
  app,
  options,
) => {
  const { processManager, projectStore, testDetectionService } = options;

  app.get<{ Params: ProjectParams; Querystring: TestOverviewQuery }>(
    '/projects/:projectId/tests',
    {
      schema: {
        params: projectParamsSchema,
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            refresh: { type: 'boolean' },
          },
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['tests'],
            properties: {
              tests: projectTestOverviewResponseSchema,
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = requireProject(projectStore, request.params.projectId);
      if (request.query.refresh) {
        testDetectionService.invalidate(project.id);
      }
      const tests = await testDetectionService.getOverview(project);
      return { tests };
    },
  );

  app.get<{ Params: ProjectParams }>(
    '/projects/:projectId/tests/process',
    {
      schema: {
        params: projectParamsSchema,
        querystring: emptyQuerystringSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['process'],
            properties: {
              process: nullableManagedProcessResponseSchema,
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = requireProject(projectStore, request.params.projectId);
      const managedProcess = await processManager.getTestProcess(project.id);
      return { process: managedProcess };
    },
  );

  app.get<{ Params: ProjectParams; Querystring: TestLogQuery }>(
    '/projects/:projectId/tests/process/logs',
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
      const project = requireProject(projectStore, request.params.projectId);
      try {
        const log = await processManager.readTestLog(project.id, {
          ...(request.query.maxBytes !== undefined
            ? { maxBytes: request.query.maxBytes }
            : {}),
        });
        return { log };
      } catch (error) {
        if (error instanceof ProcessManagerError) {
          throw processManagerApiError(error);
        }
        throw error;
      }
    },
  );

  app.delete<{ Params: ProjectParams }>(
    '/projects/:projectId/tests/process/logs',
    {
      schema: {
        params: projectParamsSchema,
        querystring: emptyQuerystringSchema,
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
      const project = requireProject(projectStore, request.params.projectId);
      try {
        const log = await processManager.clearTestLog(project.id);
        return { log };
      } catch (error) {
        if (error instanceof ProcessManagerError) {
          throw processManagerApiError(error);
        }
        throw error;
      }
    },
  );

  app.post<{ Params: TestCommandParams }>(
    '/projects/:projectId/tests/:commandId/start',
    {
      schema: {
        params: testCommandParamsSchema,
        body: emptyBodySchema,
        querystring: emptyQuerystringSchema,
        response: {
          201: {
            type: 'object',
            additionalProperties: false,
            required: ['process'],
            properties: { process: managedProcessResponseSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      const project = requireProject(projectStore, request.params.projectId);
      const resolved = await testDetectionService.resolveCommand(
        project,
        request.params.commandId,
      );

      if (!resolved) {
        throw new ApiError({
          statusCode: 404,
          code: 'TEST_COMMAND_NOT_FOUND',
          message: 'Comando de teste não encontrado para este projeto.',
        });
      }

      try {
        const managedProcess = await processManager.startTest(project, {
          id: request.params.commandId,
          command: resolved.command,
          args: resolved.args,
        });
        return reply.code(201).send({ process: managedProcess });
      } catch (error) {
        if (error instanceof ProcessManagerError) {
          throw processManagerApiError(error);
        }
        request.log.error(
          { err: error, projectId: project.id },
          'Test start failed',
        );
        throw new ApiError({
          statusCode: 500,
          code: 'TEST_START_FAILED',
          message: 'Não foi possível iniciar a execução dos testes.',
        });
      }
    },
  );

  app.post<{ Params: ProjectParams }>(
    '/projects/:projectId/tests/process/stop',
    {
      schema: {
        params: projectParamsSchema,
        body: emptyBodySchema,
        querystring: emptyQuerystringSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['process'],
            properties: { process: managedProcessResponseSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = requireProject(projectStore, request.params.projectId);
      try {
        const managedProcess = await processManager.stopTest(project.id);
        return { process: managedProcess };
      } catch (error) {
        if (error instanceof ProcessManagerError) {
          throw processManagerApiError(error);
        }
        throw error;
      }
    },
  );
};
