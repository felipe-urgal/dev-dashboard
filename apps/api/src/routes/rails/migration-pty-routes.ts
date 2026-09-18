import type { FastifyInstance } from 'fastify';

import { ApiError } from '../../http/api-error.js';
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

interface EnvironmentQuery {
  environmentInstanceId?: string;
}

interface StartBody {
  operation: (typeof mutationOperationEnum)[number];
}

const environmentQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    environmentInstanceId: { type: 'string', minLength: 1, maxLength: 512 },
  },
} as const;

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

function resolveExecutionContext(
  options: RailsRouteOptions,
  projectId: string,
  environmentInstanceId?: string,
) {
  if (environmentInstanceId === undefined) return undefined;

  const executionContext =
    options.developmentEnvironmentInstanceStore.resolveForProject(
      projectId,
      environmentInstanceId,
    );
  if (!executionContext) {
    throw new ApiError({
      statusCode: 404,
      code: 'ENVIRONMENT_INSTANCE_NOT_FOUND',
      message: 'Ambiente de desenvolvimento não encontrado para este projeto.',
    });
  }
  return executionContext;
}

export function registerRailsMigrationPtyRoutes(
  app: FastifyInstance,
  options: RailsRouteOptions,
): void {
  const { projectStore, railsMigrationPtyService } = options;

  app.get<{ Params: Params; Querystring: EnvironmentQuery }>(
    '/projects/:projectId/rails/migrations/pty/status',
    {
      schema: {
        params: paramsSchema,
        querystring: environmentQuerySchema,
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
      const executionContext = resolveExecutionContext(
        options,
        project.id,
        request.query.environmentInstanceId,
      );
      return {
        snapshot:
          railsMigrationPtyService.snapshot(project, executionContext) ?? null,
      };
    },
  );

  app.post<{
    Params: Params;
    Querystring: EnvironmentQuery;
    Body: StartBody;
  }>(
    '/projects/:projectId/rails/migrations/pty/start',
    {
      schema: {
        params: paramsSchema,
        querystring: environmentQuerySchema,
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
      const executionContext = resolveExecutionContext(
        options,
        project.id,
        request.query.environmentInstanceId,
      );
      try {
        const snapshot = await railsMigrationPtyService.start(
          project,
          request.body.operation,
          executionContext,
        );
        return reply.code(201).send({ snapshot });
      } catch (error) {
        translateMutationError(error);
      }
    },
  );

  app.post<{ Params: Params; Querystring: EnvironmentQuery }>(
    '/projects/:projectId/rails/migrations/pty/cancel',
    {
      schema: {
        params: paramsSchema,
        querystring: environmentQuerySchema,
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
      const executionContext = resolveExecutionContext(
        options,
        project.id,
        request.query.environmentInstanceId,
      );
      railsMigrationPtyService.cancel(project, executionContext);
      return { ok: true };
    },
  );

  app.get<{ Params: Params; Querystring: EnvironmentQuery }>(
    '/projects/:projectId/rails/migrations/pty/connect',
    {
      websocket: true,
      schema: {
        params: paramsSchema,
        querystring: environmentQuerySchema,
      },
    },
    (socket, request) => {
      const project = projectStore.findProject(request.params.projectId);
      if (!project) {
        socket.close(1008, 'Projeto não encontrado');
        return;
      }

      let executionContext;
      try {
        executionContext = resolveExecutionContext(
          options,
          project.id,
          request.query.environmentInstanceId,
        );
      } catch (error) {
        if (
          error instanceof ApiError &&
          error.code === 'ENVIRONMENT_INSTANCE_NOT_FOUND'
        ) {
          socket.close(1008, 'Ambiente não encontrado');
          return;
        }
        throw error;
      }

      const limitedSocket = withWebSocketMessageRateLimit(socket);
      railsMigrationPtyService.attach(project, limitedSocket, executionContext);
    },
  );
}
