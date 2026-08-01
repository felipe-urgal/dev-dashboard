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
  emptyQuerystringSchema,
  processManagerApiError,
  projectParamsSchema,
  requireProject,
  type ProjectParams,
  type TestLogQuery,
  type TestOverviewQuery,
  type TestRouteOptions,
} from './helpers.js';

export function registerTestProcessRoutes(
  app: FastifyInstance,
  options: TestRouteOptions,
): void {
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
}
