import type { FastifyInstance } from 'fastify';

import { ProcessManagerError } from '@dev-dashboard/process-manager';

import { ApiError } from '../../http/api-error.js';
import {
  commonErrorResponseSchemas,
  managedProcessResponseSchema,
  projectTestFileResponseSchema,
} from '../../http/response-schemas.js';
import { TestFileError } from '../../services/test-detection-service.js';
import {
  emptyBodySchema,
  emptyQuerystringSchema,
  processManagerApiError,
  requireProject,
  testCommandParamsSchema,
  testFileApiError,
  type TestCommandParams,
  type TestFileStartBody,
  type TestRouteOptions,
} from './helpers.js';

export function registerTestCommandRoutes(
  app: FastifyInstance,
  options: TestRouteOptions,
): void {
  const {
    processManager,
    projectStore,
    testDetectionService,
    testExecutionHistoryService,
  } = options;

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
        await testExecutionHistoryService.reconcile(project.id);
        const managedProcess = await processManager.startTest(project, {
          id: request.params.commandId,
          command: resolved.command,
          args: resolved.args,
        });
        await testExecutionHistoryService.recordStart(
          project.id,
          managedProcess,
        );
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

  app.get<{ Params: TestCommandParams }>(
    '/projects/:projectId/tests/:commandId/files',
    {
      schema: {
        params: testCommandParamsSchema,
        querystring: emptyQuerystringSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['files'],
            properties: {
              files: { type: 'array', items: projectTestFileResponseSchema },
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = requireProject(projectStore, request.params.projectId);
      const files = await testDetectionService.listTestFiles(
        project,
        request.params.commandId,
      );

      if (!files) {
        throw new ApiError({
          statusCode: 404,
          code: 'TEST_COMMAND_NOT_FOUND',
          message: 'Comando de teste não encontrado para este projeto.',
        });
      }

      return { files };
    },
  );

  app.post<{ Params: TestCommandParams; Body: TestFileStartBody }>(
    '/projects/:projectId/tests/:commandId/files/start',
    {
      schema: {
        params: testCommandParamsSchema,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['path'],
          properties: {
            path: { type: 'string', minLength: 1, maxLength: 2048 },
          },
        },
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

      let resolved;
      try {
        resolved = await testDetectionService.resolveFileCommand(
          project,
          request.params.commandId,
          request.body.path,
        );
      } catch (error) {
        if (error instanceof TestFileError) {
          throw testFileApiError(error);
        }
        throw error;
      }

      if (!resolved) {
        throw new ApiError({
          statusCode: 404,
          code: 'TEST_COMMAND_NOT_FOUND',
          message: 'Comando de teste não encontrado para este projeto.',
        });
      }

      try {
        await testExecutionHistoryService.reconcile(project.id);
        const managedProcess = await processManager.startTest(project, {
          id: `${request.params.commandId}:file`,
          command: resolved.command,
          args: resolved.args,
        });
        await testExecutionHistoryService.recordStart(
          project.id,
          managedProcess,
        );
        return reply.code(201).send({ process: managedProcess });
      } catch (error) {
        if (error instanceof ProcessManagerError) {
          throw processManagerApiError(error);
        }
        request.log.error(
          { err: error, projectId: project.id },
          'Test file start failed',
        );
        throw new ApiError({
          statusCode: 500,
          code: 'TEST_START_FAILED',
          message: 'Não foi possível iniciar a execução do arquivo de teste.',
        });
      }
    },
  );
}
