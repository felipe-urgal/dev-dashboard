import type { FastifyPluginAsync } from 'fastify';

import { ApiError } from '../http/api-error.js';
import { commonErrorResponseSchemas } from '../http/response-schemas.js';
import { withWebSocketMessageRateLimit } from '../security/rate-limited-websocket.js';
import type { ProjectTerminalService } from '../services/project-terminal-service.js';
import type { ProjectStore } from '../store/project-store.js';
import type { ProjectParams } from './projects/helpers.js';

interface ProjectTerminalRouteOptions {
  projectStore: ProjectStore;
  projectTerminalService: ProjectTerminalService;
}

const TERMINAL_KINDS = ['shell', 'rails-console'] as const;

interface KindParams extends ProjectParams {
  kind: (typeof TERMINAL_KINDS)[number];
}

interface ConnectQuery {
  confirmationToken?: string;
}

const kindParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId', 'kind'],
  properties: {
    projectId: { type: 'string', minLength: 1 },
    kind: { type: 'string', enum: [...TERMINAL_KINDS] },
  },
} as const;

const connectQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    confirmationToken: { type: 'string', minLength: 64, maxLength: 64 },
  },
} as const;

const statusSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'supported', 'activeSessions', 'message'],
  properties: {
    kind: { type: 'string', enum: [...TERMINAL_KINDS] },
    supported: { type: 'boolean' },
    activeSessions: { type: 'integer', minimum: 0 },
    message: { type: 'string' },
  },
} as const;

const confirmationSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['token', 'expiresAt'],
  properties: {
    token: { type: 'string' },
    expiresAt: { type: 'string' },
  },
} as const;

export const projectTerminalRoutes: FastifyPluginAsync<
  ProjectTerminalRouteOptions
> = async (app, options) => {
  function projectFor(projectId: string) {
    const project = options.projectStore.findProject(projectId);
    if (!project) {
      throw new ApiError({
        statusCode: 404,
        code: 'PROJECT_NOT_FOUND',
        message: 'Projeto não encontrado.',
      });
    }
    return project;
  }

  app.get<{ Params: KindParams }>(
    '/projects/:projectId/terminal/:kind',
    {
      schema: {
        params: kindParamsSchema,
        response: {
          200: statusSchema,
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) =>
      options.projectTerminalService.status(
        projectFor(request.params.projectId),
        request.params.kind,
      ),
  );

  app.post<{ Params: KindParams }>(
    '/projects/:projectId/terminal/:kind/confirmations',
    {
      schema: {
        params: kindParamsSchema,
        response: {
          201: {
            type: 'object',
            additionalProperties: false,
            required: ['confirmation'],
            properties: { confirmation: confirmationSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      const project = projectFor(request.params.projectId);
      return reply.code(201).send({
        confirmation: options.projectTerminalService.prepareConfirmation(
          project,
          request.params.kind,
        ),
      });
    },
  );

  app.get<{ Params: KindParams; Querystring: ConnectQuery }>(
    '/projects/:projectId/terminal/:kind/connect',
    {
      websocket: true,
      schema: { params: kindParamsSchema, querystring: connectQuerySchema },
    },
    (socket, request) => {
      const project = options.projectStore.findProject(
        request.params.projectId,
      );
      if (!project) {
        socket.close(1008, 'Projeto não encontrado');
        return;
      }

      const limitedSocket = withWebSocketMessageRateLimit(socket);
      void options.projectTerminalService
        .attach(
          project,
          request.params.kind,
          request.query.confirmationToken,
          limitedSocket,
        )
        .catch((error: unknown) => {
          request.log.error(
            {
              err: error,
              projectId: request.params.projectId,
              kind: request.params.kind,
            },
            'Falha ao anexar o WebSocket à sessão de terminal.',
          );
          limitedSocket.close(1011, 'Falha ao iniciar sessão de terminal');
        });
    },
  );
};
