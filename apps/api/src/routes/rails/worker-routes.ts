import type { FastifyInstance } from 'fastify';

import type { ProcessLogSnapshot } from '@dev-dashboard/contracts';

import { streamLogSnapshots } from '../../http/log-event-stream.js';
import {
  commonErrorResponseSchemas,
  managedProcessResponseSchema,
  processLogSnapshotResponseSchema,
} from '../../http/response-schemas.js';
import { railsWorkerOverviewResponseSchema } from '../../http/response-schemas/rails.js';
import {
  requireProject,
  translateWorkerError,
  workerLogQuerySchema,
  workerParamsSchema,
  type RailsRouteOptions,
  type WorkerLogQuery,
  type WorkerParams,
} from './helpers.js';

export function registerRailsWorkerRoutes(
  app: FastifyInstance,
  options: RailsRouteOptions,
): void {
  app.get<{ Params: WorkerParams }>(
    '/projects/:projectId/rails/workers/:workerId',
    {
      schema: {
        params: workerParamsSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['worker'],
            properties: { worker: railsWorkerOverviewResponseSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => ({
      worker: await options.railsRuntimeService.getWorkerOverview(
        requireProject(options.projectStore, request.params.projectId),
        request.params.workerId,
      ),
    }),
  );

  app.get<{ Params: WorkerParams; Querystring: WorkerLogQuery }>(
    '/projects/:projectId/rails/workers/:workerId/logs',
    {
      schema: {
        params: workerParamsSchema,
        querystring: workerLogQuerySchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['log'],
            properties: { log: processLogSnapshotResponseSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = requireProject(
        options.projectStore,
        request.params.projectId,
      );
      try {
        return {
          log: await options.railsRuntimeService.readWorkerLog(
            project.id,
            request.params.workerId,
            request.query.maxBytes !== undefined
              ? { maxBytes: request.query.maxBytes }
              : {},
          ),
        };
      } catch (error) {
        translateWorkerError(error);
      }
    },
  );

  app.get<{ Params: WorkerParams; Querystring: WorkerLogQuery }>(
    '/projects/:projectId/rails/workers/:workerId/logs/events',
    {
      schema: {
        params: workerParamsSchema,
        querystring: workerLogQuerySchema,
      },
    },
    async (request, reply) => {
      const project = requireProject(
        options.projectStore,
        request.params.projectId,
      );
      const readOptions = {
        ...(request.query.maxBytes !== undefined
          ? { maxBytes: request.query.maxBytes }
          : {}),
      };
      const readLog = () =>
        options.railsRuntimeService.readWorkerLog(
          project.id,
          request.params.workerId,
          readOptions,
        );

      let initial: ProcessLogSnapshot;
      try {
        initial = await readLog();
      } catch (error) {
        translateWorkerError(error);
      }

      streamLogSnapshots(reply, initial, readLog);
    },
  );

  app.delete<{ Params: WorkerParams }>(
    '/projects/:projectId/rails/workers/:workerId/logs',
    {
      schema: {
        params: workerParamsSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['log'],
            properties: { log: processLogSnapshotResponseSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = requireProject(
        options.projectStore,
        request.params.projectId,
      );
      try {
        return {
          log: await options.railsRuntimeService.clearWorkerLog(
            project.id,
            request.params.workerId,
          ),
        };
      } catch (error) {
        translateWorkerError(error);
      }
    },
  );

  app.post<{ Params: WorkerParams }>(
    '/projects/:projectId/rails/workers/:workerId/start',
    {
      schema: {
        params: workerParamsSchema,
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
      const project = requireProject(
        options.projectStore,
        request.params.projectId,
      );
      try {
        const managedProcess = await options.railsRuntimeService.startWorker(
          project,
          request.params.workerId,
        );
        return reply.code(201).send({ process: managedProcess });
      } catch (error) {
        translateWorkerError(error);
      }
    },
  );

  app.post<{ Params: WorkerParams }>(
    '/projects/:projectId/rails/workers/:workerId/stop',
    {
      schema: {
        params: workerParamsSchema,
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
      const project = requireProject(
        options.projectStore,
        request.params.projectId,
      );
      try {
        return {
          process: await options.railsRuntimeService.stopWorker(
            project.id,
            request.params.workerId,
          ),
        };
      } catch (error) {
        translateWorkerError(error);
      }
    },
  );

  app.post<{ Params: WorkerParams }>(
    '/projects/:projectId/rails/workers/:workerId/restart',
    {
      schema: {
        params: workerParamsSchema,
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
      const project = requireProject(
        options.projectStore,
        request.params.projectId,
      );
      try {
        return {
          process: await options.railsRuntimeService.restartWorker(
            project,
            request.params.workerId,
          ),
        };
      } catch (error) {
        translateWorkerError(error);
      }
    },
  );
}
