import type {
  FastifyPluginAsync,
  FastifyPluginOptions,
} from 'fastify';

import {
  ProcessManagerError,
  type ProcessManager,
} from '@dev-dashboard/process-manager';

import { ApiError } from '../http/api-error.js';
import {
  commonErrorResponseSchemas,
  managedProcessResponseSchema,
} from '../http/response-schemas.js';
import type { ProjectStore } from '../store/project-store.js';
import type { TestDetectionService } from '../services/test-detection-service.js';
import type { TestExecutionHistoryService } from '../services/test-execution-history-service.js';
import {
  RelatedTestError,
  RelatedTestService,
} from '../services/related-test-service.js';

interface TestRelatedRouteOptions extends FastifyPluginOptions {
  processManager: ProcessManager;
  projectStore: ProjectStore;
  testDetectionService: TestDetectionService;
  testExecutionHistoryService: TestExecutionHistoryService;
}

interface TestCommandParams {
  projectId: string;
  commandId: string;
}

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

const relatedTestsResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['related'],
  properties: {
    related: {
      type: 'object',
      additionalProperties: false,
      required: ['baseBranch', 'currentBranch', 'changedFiles', 'testFiles'],
      properties: {
        baseBranch: { type: 'string', maxLength: 256 },
        currentBranch: { type: 'string', maxLength: 256 },
        changedFiles: {
          type: 'array',
          maxItems: 2_000,
          items: { type: 'string', maxLength: 2_048 },
        },
        testFiles: {
          type: 'array',
          maxItems: 100,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['path'],
            properties: {
              path: { type: 'string', maxLength: 2_048 },
            },
          },
        },
      },
    },
  },
} as const;

function requireProject(projectStore: ProjectStore, projectId: string) {
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

function relatedTestApiError(error: RelatedTestError): ApiError {
  const statusCode = error.code === 'RELATED_TESTS_COMMAND_NOT_FOUND' ? 404 : 400;
  return new ApiError({
    statusCode,
    code: error.code,
    message: error.message,
  });
}

function processManagerApiError(error: ProcessManagerError): ApiError {
  const conflictCodes = new Set([
    'PROCESS_ALREADY_RUNNING',
    'PROCESS_IDENTITY_MISMATCH',
    'PROCESS_STOP_TIMEOUT',
  ]);
  return new ApiError({
    statusCode: error.code === 'PROCESS_NOT_FOUND'
      ? 404
      : conflictCodes.has(error.code)
        ? 409
        : 400,
    code: error.code,
    message: error.message,
  });
}

export const testRelatedRoutes: FastifyPluginAsync<TestRelatedRouteOptions> = async (
  app,
  options,
) => {
  const {
    processManager,
    projectStore,
    testDetectionService,
    testExecutionHistoryService,
  } = options;
  const relatedTestService = new RelatedTestService(testDetectionService);

  app.get<{ Params: TestCommandParams }>(
    '/projects/:projectId/tests/:commandId/related',
    {
      schema: {
        params: testCommandParamsSchema,
        querystring: emptyQuerystringSchema,
        response: {
          200: relatedTestsResponseSchema,
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = requireProject(projectStore, request.params.projectId);
      try {
        const related = await relatedTestService.resolve(project, request.params.commandId);
        return {
          related: {
            baseBranch: related.baseBranch,
            currentBranch: related.currentBranch,
            changedFiles: related.changedFiles,
            testFiles: related.testFiles.map((filePath) => ({ path: filePath })),
          },
        };
      } catch (error) {
        if (error instanceof RelatedTestError) throw relatedTestApiError(error);
        throw error;
      }
    },
  );

  app.post<{ Params: TestCommandParams }>(
    '/projects/:projectId/tests/:commandId/related/start',
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
      try {
        const related = await relatedTestService.resolve(project, request.params.commandId);
        if (related.testFiles.length === 0) {
          throw new ApiError({
            statusCode: 409,
            code: 'RELATED_TESTS_NOT_FOUND',
            message: 'Nenhum teste relacionado às alterações da branch foi encontrado.',
          });
        }

        await testExecutionHistoryService.reconcile(project.id);
        const managedProcess = await processManager.startTest(project, {
          id: `${request.params.commandId}:related`,
          command: related.resolved.command,
          args: related.resolved.args,
        });
        await testExecutionHistoryService.recordStart(project.id, managedProcess);
        return reply.code(201).send({ process: managedProcess });
      } catch (error) {
        if (error instanceof ApiError) throw error;
        if (error instanceof RelatedTestError) throw relatedTestApiError(error);
        if (error instanceof ProcessManagerError) throw processManagerApiError(error);
        request.log.error(
          { err: error, projectId: project.id },
          'Related test start failed',
        );
        throw new ApiError({
          statusCode: 500,
          code: 'TEST_START_FAILED',
          message: 'Não foi possível iniciar os testes relacionados.',
        });
      }
    },
  );
};
