import type { FastifyPluginAsync } from 'fastify';

import { ApiError } from '../http/api-error.js';
import { commonErrorResponseSchemas } from '../http/response-schemas.js';
import type { ProjectLanguageServerService } from '../services/project-language-server-service.js';
import type { ProjectStore } from '../store/project-store.js';
import {
  projectParamsSchema,
  type ProjectParams,
} from './projects/helpers.js';

interface ProjectLanguageServerRouteOptions {
  projectStore: ProjectStore;
  projectLanguageServerService: ProjectLanguageServerService;
}

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
    kind: { type: 'string', enum: ['javascript-typescript'] },
    supported: { type: 'boolean' },
    available: { type: 'boolean' },
    state: {
      type: 'string',
      enum: ['unavailable', 'idle', 'starting', 'ready', 'failed'],
    },
    activeConnections: { type: 'integer', minimum: 0, maximum: 1 },
    message: { type: 'string' },
    lastStartedAt: { type: 'string' },
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

  app.get<{ Params: ProjectParams }>(
    '/projects/:projectId/language-server',
    {
      schema: {
        params: projectParamsSchema,
        response: {
          200: statusSchema,
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) =>
      options.projectLanguageServerService.status(
        projectFor(request.params.projectId),
      ),
  );

  app.get<{ Params: ProjectParams }>(
    '/projects/:projectId/language-server/connect',
    { websocket: true },
    (socket, request) => {
      const project = options.projectStore.findProject(request.params.projectId);
      if (!project) {
        socket.close(1008, 'Projeto não encontrado');
        return;
      }
      void options.projectLanguageServerService.attach(project, socket).catch(() => {
        socket.close(1011, 'Falha ao iniciar servidor de linguagem');
      });
    },
  );
};
