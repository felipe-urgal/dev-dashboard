import type { FastifyInstance } from 'fastify';

import { ApiError, type ApiErrorCode } from '../../http/api-error.js';
import { commonErrorResponseSchemas } from '../../http/response-schemas.js';
import { withWebSocketMessageRateLimit } from '../../security/rate-limited-websocket.js';
import { ProjectTestPtyError } from '../../services/project-test-pty-service.js';
import type { DevelopmentEnvironmentInstanceStore } from '../../store/development-environment-instance-store.js';
import {
  emptyBodySchema,
  projectParamsSchema,
  requireProject,
  type ProjectParams,
  type TestRouteOptions,
} from './helpers.js';

interface EnvironmentQuery {
  environmentInstanceId?: string;
}

interface StartBody {
  commandId: string;
}

export type TestPtyRouteOptions = TestRouteOptions & {
  developmentEnvironmentInstanceStore: DevelopmentEnvironmentInstanceStore;
};

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
  required: ['commandId'],
  properties: {
    commandId: { type: 'string', minLength: 1, maxLength: 200 },
  },
} as const;

const snapshotSchema = {
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
} as const;

// Mesmo padrão de nullableManagedProcessResponseSchema
// (apps/api/src/http/response-schemas/processes.ts): `type: [...]` numa
// única definição, não `anyOf` com dois sub-schemas — fast-json-stringify
// (serializador de resposta do Fastify) não lida bem com anyOf misturando
// objeto e null.
const nullableSnapshotSchema = {
  ...snapshotSchema,
  type: ['object', 'null'],
} as const;

const PTY_ERROR_RESPONSE: Record<
  ProjectTestPtyError['code'],
  { statusCode: number; code: ApiErrorCode }
> = {
  TEST_COMMAND_NOT_FOUND: { statusCode: 404, code: 'TEST_COMMAND_NOT_FOUND' },
  ALREADY_RUNNING: { statusCode: 409, code: 'TEST_PTY_ALREADY_RUNNING' },
  START_FAILED: { statusCode: 500, code: 'TEST_PTY_START_FAILED' },
};

function ptyApiError(error: ProjectTestPtyError): ApiError {
  const { statusCode, code } = PTY_ERROR_RESPONSE[error.code];
  return new ApiError({ statusCode, code, message: error.message });
}

function resolveExecutionContext(
  store: DevelopmentEnvironmentInstanceStore,
  projectId: string,
  environmentInstanceId?: string,
) {
  if (environmentInstanceId === undefined) return undefined;

  const executionContext = store.resolveForProject(
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

export function registerTestPtyRoutes(
  app: FastifyInstance,
  options: TestPtyRouteOptions,
): void {
  const {
    projectStore,
    developmentEnvironmentInstanceStore,
    projectTestPtyService,
  } = options;

  app.get<{ Params: ProjectParams; Querystring: EnvironmentQuery }>(
    '/projects/:projectId/tests/pty/status',
    {
      schema: {
        params: projectParamsSchema,
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
        developmentEnvironmentInstanceStore,
        project.id,
        request.query.environmentInstanceId,
      );
      return {
        snapshot:
          projectTestPtyService.snapshot(project, executionContext) ?? null,
      };
    },
  );

  app.post<{
    Params: ProjectParams;
    Querystring: EnvironmentQuery;
    Body: StartBody;
  }>(
    '/projects/:projectId/tests/pty/start',
    {
      schema: {
        params: projectParamsSchema,
        querystring: environmentQuerySchema,
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
      const executionContext = resolveExecutionContext(
        developmentEnvironmentInstanceStore,
        project.id,
        request.query.environmentInstanceId,
      );
      try {
        const snapshot = await projectTestPtyService.start(
          project,
          request.body.commandId,
          executionContext,
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

  app.post<{ Params: ProjectParams; Querystring: EnvironmentQuery }>(
    '/projects/:projectId/tests/pty/cancel',
    {
      schema: {
        params: projectParamsSchema,
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
        developmentEnvironmentInstanceStore,
        project.id,
        request.query.environmentInstanceId,
      );
      projectTestPtyService.cancel(project, executionContext);
      return { ok: true };
    },
  );

  app.get<{ Params: ProjectParams; Querystring: EnvironmentQuery }>(
    '/projects/:projectId/tests/pty/connect',
    {
      websocket: true,
      schema: {
        params: projectParamsSchema,
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
          developmentEnvironmentInstanceStore,
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
      projectTestPtyService.attach(project, limitedSocket, executionContext);
    },
  );
}
