import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';
import type { WebSocket } from 'ws';

import { ApiError, type ApiErrorCode } from '../http/api-error.js';
import { commonErrorResponseSchemas } from '../http/response-schemas.js';
import type { LocalCiJobRequest } from '../services/local-ci-act.js';
import type { LocalCiDiscoveryService } from '../services/local-ci-discovery-service.js';
import {
  LocalCiExecutionError,
  type LocalCiExecutionService,
  type LocalCiExecutionSnapshot,
} from '../services/local-ci-execution-service.js';
import type { ProjectStore } from '../store/project-store.js';

interface Options extends FastifyPluginOptions {
  projectStore: ProjectStore;
  localCiDiscoveryService: Pick<LocalCiDiscoveryService, 'discover'>;
  localCiExecutionService:
    | Pick<LocalCiExecutionService, 'start' | 'get' | 'reattach' | 'cancel'>
    | undefined;
}

interface ProjectParams {
  projectId: string;
}

interface RunParams extends ProjectParams {
  runId: string;
}

const projectParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId'],
  properties: {
    projectId: { type: 'string', minLength: 1 },
  },
} as const;

const runParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId', 'runId'],
  properties: {
    projectId: { type: 'string', minLength: 1 },
    runId: { type: 'string', minLength: 1, maxLength: 256 },
  },
} as const;

const jobRequestSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['workflowFile', 'jobId', 'event'],
  properties: {
    workflowFile: { type: 'string', minLength: 1, maxLength: 1024 },
    jobId: { type: 'string', minLength: 1, maxLength: 128 },
    event: { type: 'string', minLength: 1, maxLength: 128 },
  },
} as const;

const availabilitySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['state'],
  properties: {
    state: {
      type: 'string',
      enum: ['available', 'act-missing', 'docker-unavailable'],
    },
    actVersion: { type: 'string' },
    dockerVersion: { type: 'string' },
  },
} as const;

const jobSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['workflowFile', 'workflow', 'jobId', 'job', 'events'],
  properties: {
    workflowFile: { type: 'string' },
    workflow: { type: 'string' },
    jobId: { type: 'string' },
    job: { type: 'string' },
    events: { type: 'array', items: { type: 'string' } },
  },
} as const;

const catalogSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['provider', 'approximation', 'availability', 'jobs'],
  properties: {
    provider: { type: 'string', enum: ['act'] },
    approximation: { type: 'boolean', enum: [true] },
    availability: availabilitySchema,
    jobs: { type: 'array', items: jobSchema },
  },
} as const;

const requestSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['workflowFile', 'jobId', 'event'],
  properties: {
    workflowFile: { type: 'string' },
    jobId: { type: 'string' },
    event: { type: 'string' },
  },
} as const;

const executionSnapshotSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'projectId',
    'provider',
    'approximation',
    'request',
    'status',
    'logs',
    'truncated',
    'exitCode',
    'exitSignal',
    'timedOut',
    'startedAt',
    'endedAt',
  ],
  properties: {
    id: { type: 'string' },
    projectId: { type: 'string' },
    provider: { type: 'string', enum: ['act'] },
    approximation: { type: 'boolean', enum: [true] },
    request: requestSchema,
    status: { type: 'string', enum: ['running', 'exited'] },
    logs: { type: 'string' },
    truncated: { type: 'boolean' },
    exitCode: { type: ['integer', 'null'] },
    exitSignal: { type: ['integer', 'null'] },
    timedOut: { type: 'boolean' },
    startedAt: { type: 'string' },
    endedAt: { type: ['string', 'null'] },
  },
} as const;

function requireProject(store: ProjectStore, projectId: string) {
  const project = store.findProject(projectId);
  if (!project) {
    throw new ApiError({
      statusCode: 404,
      code: 'PROJECT_NOT_FOUND',
      message: 'Projeto não encontrado.',
    });
  }
  return project;
}

const executionErrorResponses: Record<
  LocalCiExecutionError['code'],
  { statusCode: number; code: ApiErrorCode }
> = {
  LOCAL_CI_BUSY: { statusCode: 409, code: 'LOCAL_CI_BUSY' },
  LOCAL_CI_INVALID_REQUEST: {
    statusCode: 400,
    code: 'LOCAL_CI_INVALID_REQUEST',
  },
  LOCAL_CI_UNAVAILABLE: { statusCode: 503, code: 'LOCAL_CI_UNAVAILABLE' },
  LOCAL_CI_START_FAILED: { statusCode: 500, code: 'LOCAL_CI_START_FAILED' },
  LOCAL_CI_NOT_FOUND: { statusCode: 404, code: 'LOCAL_CI_NOT_FOUND' },
  LOCAL_CI_NOT_RUNNING: { statusCode: 409, code: 'LOCAL_CI_NOT_RUNNING' },
};

function executionApiError(error: LocalCiExecutionError): ApiError {
  const mapped = executionErrorResponses[error.code];
  return new ApiError({
    statusCode: mapped.statusCode,
    code: mapped.code,
    message: error.message,
  });
}

function requireExecutionService(service: Options['localCiExecutionService']) {
  if (!service) {
    throw new ApiError({
      statusCode: 503,
      code: 'LOCAL_CI_UNAVAILABLE',
      message: 'Execução Local CI não está disponível neste runtime.',
    });
  }
  return service;
}

function sendJson(socket: WebSocket, message: unknown): void {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

export const localCiRoutes: FastifyPluginAsync<Options> = async (
  app,
  options,
) => {
  app.get<{ Params: ProjectParams }>(
    '/projects/:projectId/local-ci/catalog',
    {
      schema: {
        params: projectParamsSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['catalog'],
            properties: { catalog: catalogSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => ({
      catalog: await options.localCiDiscoveryService.discover(
        requireProject(options.projectStore, request.params.projectId),
      ),
    }),
  );

  app.post<{ Params: ProjectParams; Body: LocalCiJobRequest }>(
    '/projects/:projectId/local-ci/runs',
    {
      schema: {
        params: projectParamsSchema,
        body: jobRequestSchema,
        response: {
          201: {
            type: 'object',
            additionalProperties: false,
            required: ['run'],
            properties: { run: executionSnapshotSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      const service = requireExecutionService(options.localCiExecutionService);
      try {
        const run = await service.start(
          requireProject(options.projectStore, request.params.projectId),
          request.body,
        );
        return reply.code(201).send({ run });
      } catch (error) {
        if (error instanceof LocalCiExecutionError) {
          throw executionApiError(error);
        }
        throw error;
      }
    },
  );

  app.get<{ Params: RunParams }>(
    '/projects/:projectId/local-ci/runs/:runId',
    {
      schema: {
        params: runParamsSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['run'],
            properties: { run: executionSnapshotSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      requireProject(options.projectStore, request.params.projectId);
      const service = requireExecutionService(options.localCiExecutionService);
      try {
        return {
          run: service.get(request.params.projectId, request.params.runId),
        };
      } catch (error) {
        if (error instanceof LocalCiExecutionError) {
          throw executionApiError(error);
        }
        throw error;
      }
    },
  );

  app.post<{ Params: RunParams; Body: Record<string, never> }>(
    '/projects/:projectId/local-ci/runs/:runId/cancel',
    {
      schema: {
        params: runParamsSchema,
        body: {
          type: 'object',
          additionalProperties: false,
          maxProperties: 0,
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['ok'],
            properties: { ok: { type: 'boolean', enum: [true] } },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      requireProject(options.projectStore, request.params.projectId);
      const service = requireExecutionService(options.localCiExecutionService);
      try {
        service.cancel(request.params.projectId, request.params.runId);
        return { ok: true as const };
      } catch (error) {
        if (error instanceof LocalCiExecutionError) {
          throw executionApiError(error);
        }
        throw error;
      }
    },
  );

  app.get<{ Params: RunParams }>(
    '/projects/:projectId/local-ci/runs/:runId/connect',
    {
      websocket: true,
      schema: {
        params: runParamsSchema,
      },
    },
    (socket, request) => {
      if (!options.projectStore.findProject(request.params.projectId)) {
        socket.close(1008, 'Projeto não encontrado');
        return;
      }
      const service = options.localCiExecutionService;
      if (!service) {
        socket.close(1011, 'Execução Local CI indisponível');
        return;
      }

      let attachment;
      try {
        attachment = service.reattach(
          request.params.projectId,
          request.params.runId,
          (chunk) => sendJson(socket, { type: 'output', data: chunk }),
          (snapshot: LocalCiExecutionSnapshot) =>
            sendJson(socket, { type: 'exit', run: snapshot }),
        );
      } catch (error) {
        if (error instanceof LocalCiExecutionError) {
          sendJson(socket, { type: 'error', message: error.message });
          socket.close(1000, 'Execução não encontrada');
          return;
        }
        throw error;
      }

      sendJson(socket, { type: 'ready', run: attachment.snapshot });
      socket.once('close', attachment.detach);
      socket.once('error', attachment.detach);
    },
  );
};
