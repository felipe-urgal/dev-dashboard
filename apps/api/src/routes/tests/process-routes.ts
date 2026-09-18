import type { FastifyInstance } from 'fastify';

import { ProcessManagerError } from '@dev-dashboard/process-manager';

import {
  commonErrorResponseSchemas,
  managedProcessResponseSchema,
  nullableManagedProcessResponseSchema,
  processLogSnapshotResponseSchema,
  projectTestOverviewResponseSchema,
} from '../../http/response-schemas.js';
import {
  emptyBodySchema,
  processManagerApiError,
  projectForExecutionContext,
  projectParamsSchema,
  requireExecutionContext,
  requireProject,
  testEnvironmentQuerySchema,
  testLogQuerySchema,
  type ProjectParams,
  type TestEnvironmentQuery,
  type TestLogQuery,
  type TestOverviewQuery,
  type TestRouteOptions,
} from './helpers.js';

export function registerTestProcessRoutes(
  app: FastifyInstance,
  options: TestRouteOptions,
): void {
  const {
    processManager,
    projectStore,
    developmentEnvironmentInstanceStore,
    testDetectionService,
  } = options;

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
            environmentInstanceId: {
              type: 'string',
              minLength: 1,
              maxLength: 512,
            },
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
      const executionContext = requireExecutionContext(
        developmentEnvironmentInstanceStore,
        project.id,
        request.query.environmentInstanceId,
      );
      if (request.query.refresh) {
        testDetectionService.invalidate(project.id);
      }
      const tests = await testDetectionService.getOverview(
        projectForExecutionContext(project, executionContext),
      );
      return { tests };
    },
  );

  app.get<{ Params: ProjectParams; Querystring: TestEnvironmentQuery }>(
    '/projects/:projectId/tests/process',
    {
      schema: {
        params: projectParamsSchema,
        querystring: testEnvironmentQuerySchema,
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
      const executionContext = requireExecutionContext(
        developmentEnvironmentInstanceStore,
        project.id,
        request.query.environmentInstanceId,
      );
      const managedProcess = await processManager.getTestProcess(
        project.id,
        executionContext.environmentInstanceId,
      );
      return { process: managedProcess };
    },
  );

  app.get<{ Params: ProjectParams; Querystring: TestLogQuery }>(
    '/projects/:projectId/tests/process/logs',
    {
      schema: {
        params: projectParamsSchema,
        querystring: testLogQuerySchema,
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
      const executionContext = requireExecutionContext(
        developmentEnvironmentInstanceStore,
        project.id,
        request.query.environmentInstanceId,
      );
      try {
        const log = await processManager.readTestLog(
          project.id,
          {
            ...(request.query.maxBytes !== undefined
              ? { maxBytes: request.query.maxBytes }
              : {}),
          },
          executionContext.environmentInstanceId,
        );
        return { log };
      } catch (error) {
        if (error instanceof ProcessManagerError) {
          throw processManagerApiError(error);
        }
        throw error;
      }
    },
  );

  app.delete<{ Params: ProjectParams; Querystring: TestEnvironmentQuery }>(
    '/projects/:projectId/tests/process/logs',
    {
      schema: {
        params: projectParamsSchema,
        querystring: testEnvironmentQuerySchema,
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
      const executionContext = requireExecutionContext(
        developmentEnvironmentInstanceStore,
        project.id,
        request.query.environmentInstanceId,
      );
      try {
        const log = await processManager.clearTestLog(
          project.id,
          executionContext.environmentInstanceId,
        );
        return { log };
      } catch (error) {
        if (error instanceof ProcessManagerError) {
          throw processManagerApiError(error);
        }
        throw error;
      }
    },
  );

  app.post<{ Params: ProjectParams; Querystring: TestEnvironmentQuery }>(
    '/projects/:projectId/tests/process/stop',
    {
      schema: {
        params: projectParamsSchema,
        body: emptyBodySchema,
        querystring: testEnvironmentQuerySchema,
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
      const executionContext = requireExecutionContext(
        developmentEnvironmentInstanceStore,
        project.id,
        request.query.environmentInstanceId,
      );
      try {
        const managedProcess = await processManager.stopTest(
          project.id,
          executionContext.environmentInstanceId,
        );
        return { process: managedProcess };
      } catch (error) {
        if (error instanceof ProcessManagerError) {
          throw processManagerApiError(error);
        }
        throw error;
      }
    },
  );
}
