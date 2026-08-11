import type { FastifyInstance } from 'fastify';

import { ApiError, type ApiErrorCode } from '../../http/api-error.js';
import { commonErrorResponseSchemas } from '../../http/response-schemas.js';
import { withWebSocketMessageRateLimit } from '../../security/rate-limited-websocket.js';
import { ProjectTestPtyError } from '../../services/project-test-pty-service.js';
import {
  emptyBodySchema,
  projectParamsSchema,
  requireProject,
  type ProjectParams,
  type TestRouteOptions,
} from './helpers.js';

interface StartBody {
  commandId: string;
}

const startBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['commandId'],
  properties: {
    commandId: { type: 'string', minLength: 1, maxLength: 200 },
  },
} as const;

const nullableSnapshotSchema = {
  anyOf: [
    {
      type: 'object',
      additionalProperties: false,
      required: ['status', 'exitCode', 'exitSignal', 'startedAt', 'endedAt'],
      properties: {
        status: { type: 'string', enum: ['running', 'exited'] },
        exitCode: { type: ['integer', 'null'] },
        exitSignal: { type: ['integer', 'null'] },
        startedAt: { type: 'string' },
        endedAt: { type: ['string', 'null'] },
      },
    },
    { type: 'null' },
  ],
} as const;

function ptyApiError(error: ProjectTestPtyError): ApiError {
  const statusCode = error.code === 'TEST_COMMAND_NOT_FOUND' ? 404 : 409;
  return new ApiError({
    statusCode,
    code: error.code as ApiErrorCode,
    message: error.message,
  });
}

export function registerTestPtyRoutes(
  app: FastifyInstance,
  options: TestRouteOptions,
): void {
  const { projectStore, projectTestPtyService } = options;

  app.get<{ Params: ProjectParams }>(
    '/projects/:projectId/tests/pty/status',
    {
      schema: {
        params: projectParamsSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['snapshot'],
            properties: { snapshot: nullableSnapshotSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = requireProject(projectStore, request.params.projectId);
      return { snapshot: projectTestPtyService.snapshot(project) ?? null };
    },
  );

  app.post<{ Params: ProjectParams; Body: StartBody }>(
    '/projects/:projectId/tests/pty/start',
    {
      schema: {
        params: projectParamsSchema,
        body: startBodySchema,
        response: {
          201: {
            type: 'object',
            additionalProperties: false,
            required: ['snapshot'],
            properties: { snapshot: nullableSnapshotSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      const project = requireProject(projectStore, request.params.projectId);
      try {
        const snapshot = await projectTestPtyService.start(
          project,
          request.body.commandId,
        );
        return reply.code(201).send({ snapshot });
      } catch (error) {
        if (error instanceof ProjectTestPtyError) {
          throw ptyApiError(error);
        }
        throw error;
      }
    },
  );

  app.post<{ Params: ProjectParams }>(
    '/projects/:projectId/tests/pty/cancel',
    {
      schema: {
        params: projectParamsSchema,
        body: emptyBodySchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['ok'],
            properties: { ok: { type: 'boolean' } },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = requireProject(projectStore, request.params.projectId);
      projectTestPtyService.cancel(project);
      return { ok: true };
    },
  );

  app.get<{ Params: ProjectParams }>(
    '/projects/:projectId/tests/pty/connect',
    {
      websocket: true,
      schema: { params: projectParamsSchema },
    },
    (socket, request) => {
      const project = projectStore.findProject(request.params.projectId);
      if (!project) {
        socket.close(1008, 'Projeto não encontrado');
        return;
      }

      const limitedSocket = withWebSocketMessageRateLimit(socket);
      projectTestPtyService.attach(project, limitedSocket);
    },
  );
}
