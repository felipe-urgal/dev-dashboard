import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';

import { ApiError, type ApiErrorCode } from '../http/api-error.js';
import { commonErrorResponseSchemas } from '../http/response-schemas.js';
import { withWebSocketMessageRateLimit } from '../security/rate-limited-websocket.js';
import {
  ProjectDependenciesPtyError,
  type ProjectDependenciesPtyService,
} from '../services/project-dependencies-pty-service.js';
import type { ProjectStore } from '../store/project-store.js';

interface Params {
  projectId: string;
}
interface StartBody {
  actionId: string;
}
interface Options extends FastifyPluginOptions {
  projectStore: ProjectStore;
  projectDependenciesPtyService: ProjectDependenciesPtyService;
}

const paramsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId'],
  properties: { projectId: { type: 'string', minLength: 1 } },
} as const;

const emptyBodySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {},
} as const;

const startBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['actionId'],
  properties: { actionId: { type: 'string', minLength: 1, maxLength: 200 } },
} as const;

const snapshotSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'actionId',
    'actionName',
    'status',
    'exitCode',
    'exitSignal',
    'startedAt',
    'endedAt',
  ],
  properties: {
    actionId: { type: 'string' },
    actionName: { type: 'string' },
    status: { type: 'string', enum: ['running', 'exited'] },
    exitCode: { type: ['integer', 'null'] },
    exitSignal: { type: ['integer', 'null'] },
    startedAt: { type: 'string' },
    endedAt: { type: ['string', 'null'] },
  },
} as const;

// Mesmo padrão de nullableManagedProcessResponseSchema
// (apps/api/src/http/response-schemas/processes.ts): `type: [...]` numa
// única definição, não `anyOf`.
const nullableSnapshotSchema = {
  ...snapshotSchema,
  type: ['object', 'null'],
} as const;

const PTY_ERROR_RESPONSE: Record<
  ProjectDependenciesPtyError['code'],
  { statusCode: number; code: ApiErrorCode }
> = {
  ACTION_NOT_FOUND: { statusCode: 404, code: 'SCRIPT_NOT_FOUND' },
  ALREADY_RUNNING: {
    statusCode: 409,
    code: 'DEPENDENCIES_PTY_ALREADY_RUNNING',
  },
  START_FAILED: { statusCode: 500, code: 'DEPENDENCIES_PTY_START_FAILED' },
};

function ptyApiError(error: ProjectDependenciesPtyError): ApiError {
  const { statusCode, code } = PTY_ERROR_RESPONSE[error.code];
  return new ApiError({ statusCode, code, message: error.message });
}

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

/**
 * Item 3 da task 234: mesmo padrão de rotas de tests/pty-routes.ts e
 * rails/migration-pty-routes.ts, aplicado às ações de dependências/build
 * (instalar/atualizar gems ou pacotes Node, rodar o script `build`).
 */
export const dependenciesPtyRoutes: FastifyPluginAsync<Options> = async (
  app,
  options,
) => {
  const { projectStore, projectDependenciesPtyService } = options;

  app.get<{ Params: Params }>(
    '/projects/:projectId/dependencies/pty/status',
    {
      schema: {
        params: paramsSchema,
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
      return {
        snapshot: projectDependenciesPtyService.snapshot(project) ?? null,
      };
    },
  );

  app.post<{ Params: Params; Body: StartBody }>(
    '/projects/:projectId/dependencies/pty/start',
    {
      schema: {
        params: paramsSchema,
        body: startBodySchema,
        response: {
          201: {
            type: 'object',
            additionalProperties: false,
            required: ['snapshot'],
            properties: { snapshot: snapshotSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      const project = requireProject(projectStore, request.params.projectId);
      try {
        const snapshot = await projectDependenciesPtyService.start(
          project,
          request.body.actionId,
        );
        return reply.code(201).send({ snapshot });
      } catch (error) {
        if (error instanceof ProjectDependenciesPtyError) {
          throw ptyApiError(error);
        }
        throw error;
      }
    },
  );

  app.post<{ Params: Params }>(
    '/projects/:projectId/dependencies/pty/cancel',
    {
      schema: {
        params: paramsSchema,
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
      projectDependenciesPtyService.cancel(project);
      return { ok: true };
    },
  );

  app.get<{ Params: Params }>(
    '/projects/:projectId/dependencies/pty/connect',
    {
      websocket: true,
      schema: { params: paramsSchema },
    },
    (socket, request) => {
      const project = projectStore.findProject(request.params.projectId);
      if (!project) {
        socket.close(1008, 'Projeto não encontrado');
        return;
      }

      const limitedSocket = withWebSocketMessageRateLimit(socket);
      projectDependenciesPtyService.attach(project, limitedSocket);
    },
  );
};
