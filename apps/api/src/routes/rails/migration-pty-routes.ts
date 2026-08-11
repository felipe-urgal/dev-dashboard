import type { FastifyInstance } from 'fastify';

import { commonErrorResponseSchemas } from '../../http/response-schemas.js';
import { withWebSocketMessageRateLimit } from '../../security/rate-limited-websocket.js';
import {
  emptyBodySchema,
  mutationOperationEnum,
  paramsSchema,
  requireProject,
  translateMutationError,
  type Params,
  type RailsRouteOptions,
} from './helpers.js';

interface StartBody {
  operation: (typeof mutationOperationEnum)[number];
}

const startBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['operation'],
  properties: {
    operation: { type: 'string', enum: mutationOperationEnum },
  },
} as const;

const snapshotSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'operation',
    'status',
    'exitCode',
    'exitSignal',
    'startedAt',
    'endedAt',
  ],
  properties: {
    operation: { type: 'string', enum: mutationOperationEnum },
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

export function registerRailsMigrationPtyRoutes(
  app: FastifyInstance,
  options: RailsRouteOptions,
): void {
  const { projectStore, railsMigrationPtyService } = options;

  app.get<{ Params: Params }>(
    '/projects/:projectId/rails/migrations/pty/status',
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
      return { snapshot: railsMigrationPtyService.snapshot(project) ?? null };
    },
  );

  app.post<{ Params: Params; Body: StartBody }>(
    '/projects/:projectId/rails/migrations/pty/start',
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
        const snapshot = await railsMigrationPtyService.start(
          project,
          request.body.operation,
        );
        return reply.code(201).send({ snapshot });
      } catch (error) {
        translateMutationError(error);
      }
    },
  );

  app.post<{ Params: Params }>(
    '/projects/:projectId/rails/migrations/pty/cancel',
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
      railsMigrationPtyService.cancel(project);
      return { ok: true };
    },
  );

  app.get<{ Params: Params }>(
    '/projects/:projectId/rails/migrations/pty/connect',
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
      railsMigrationPtyService.attach(project, limitedSocket);
    },
  );
}
