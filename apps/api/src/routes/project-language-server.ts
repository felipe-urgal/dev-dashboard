import type { FastifyPluginAsync } from 'fastify';

import { ApiError } from '../http/api-error.js';
import { commonErrorResponseSchemas } from '../http/response-schemas.js';
import { withWebSocketMessageRateLimit } from '../security/rate-limited-websocket.js';
import {
  LANGUAGE_SERVER_KINDS,
  LanguageServerProtocolError,
  type ProjectLanguageServerService,
} from '../services/project-language-server-service.js';
import type { ProjectStore } from '../store/project-store.js';
import {
  projectParamsSchema,
  type ProjectParams,
} from './projects/helpers.js';

interface ProjectLanguageServerRouteOptions {
  projectStore: ProjectStore;
  projectLanguageServerService: ProjectLanguageServerService;
}

interface KindParams extends ProjectParams {
  kind: 'javascript-typescript' | 'ruby';
}

interface RailsRuntimeBody {
  enabled: boolean;
  confirmationToken?: string;
}

const kindParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId', 'kind'],
  properties: {
    projectId: { type: 'string', minLength: 1 },
    kind: { type: 'string', enum: [...LANGUAGE_SERVER_KINDS] },
  },
} as const;

const railsStatusSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['addonAvailable', 'runtimeState', 'message'],
  properties: {
    addonAvailable: { type: 'boolean' },
    runtimeState: { type: 'string', enum: ['unavailable', 'disabled', 'enabled'] },
    message: { type: 'string' },
  },
} as const;

const statusSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'kind',
    'supported',
    'available',
    'state',
    'activeConnections',
    'message',
  ],
  properties: {
    kind: { type: 'string', enum: [...LANGUAGE_SERVER_KINDS] },
    supported: { type: 'boolean' },
    available: { type: 'boolean' },
    state: {
      type: 'string',
      enum: ['unavailable', 'idle', 'starting', 'ready', 'failed'],
    },
    activeConnections: { type: 'integer', minimum: 0, maximum: 1 },
    message: { type: 'string' },
    lastStartedAt: { type: 'string' },
    rails: railsStatusSchema,
  },
} as const;

const railsRuntimeConfirmationSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['token', 'expiresAt'],
  properties: {
    token: { type: 'string' },
    expiresAt: { type: 'string' },
  },
} as const;

export const projectLanguageServerRoutes: FastifyPluginAsync<
  ProjectLanguageServerRouteOptions
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

  function translateProtocolError(error: unknown): never {
    if (error instanceof LanguageServerProtocolError) {
      throw new ApiError({
        statusCode: 409,
        code: 'LANGUAGE_SERVER_CONFIRMATION_INVALID',
        message: error.message,
      });
    }
    throw new ApiError({
      statusCode: 500,
      code: 'LANGUAGE_SERVER_FAILED',
      message: error instanceof Error ? error.message : 'Não foi possível concluir a operação.',
    });
  }

  app.get<{ Params: KindParams }>(
    '/projects/:projectId/language-server/:kind',
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
      options.projectLanguageServerService.status(
        projectFor(request.params.projectId),
        request.params.kind,
      ),
  );

  app.get<{ Params: KindParams }>(
    '/projects/:projectId/language-server/:kind/connect',
    { websocket: true },
    (socket, request) => {
      const project = options.projectStore.findProject(request.params.projectId);
      if (!project) {
        socket.close(1008, 'Projeto não encontrado');
        return;
      }

      const limitedSocket = withWebSocketMessageRateLimit(socket);
      void options.projectLanguageServerService
        .attach(project, request.params.kind, limitedSocket)
        .catch(() => {
          limitedSocket.close(1011, 'Falha ao iniciar servidor de linguagem');
        });
    },
  );

  app.post<{ Params: ProjectParams }>(
    '/projects/:projectId/language-server/ruby/rails-runtime/confirmations',
    {
      schema: {
        params: projectParamsSchema,
        response: {
          201: {
            type: 'object',
            additionalProperties: false,
            required: ['confirmation'],
            properties: { confirmation: railsRuntimeConfirmationSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      const project = projectFor(request.params.projectId);
      try {
        return reply.code(201).send({
          confirmation:
            await options.projectLanguageServerService.prepareRailsRuntimeConfirmation(project),
        });
      } catch (error) {
        translateProtocolError(error);
      }
    },
  );

  app.post<{ Params: ProjectParams; Body: RailsRuntimeBody }>(
    '/projects/:projectId/language-server/ruby/rails-runtime',
    {
      schema: {
        params: projectParamsSchema,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['enabled'],
          properties: {
            enabled: { type: 'boolean' },
            confirmationToken: { type: 'string', minLength: 64, maxLength: 64 },
          },
        },
        response: {
          200: statusSchema,
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = projectFor(request.params.projectId);
      try {
        return await options.projectLanguageServerService.setRailsRuntimeEnabled(
          project,
          request.body.enabled,
          request.body.confirmationToken,
        );
      } catch (error) {
        translateProtocolError(error);
      }
    },
  );
};
