import type { Project } from '@dev-dashboard/contracts';
import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';

import { ApiError, type ApiErrorCode } from '../http/api-error.js';
import { commonErrorResponseSchemas } from '../http/response-schemas.js';
import {
  DockerComposeLifecycleError,
  type DockerComposeLifecycleService,
} from '../services/docker-compose-lifecycle-service.js';
import type { DockerComposeOwnershipStore } from '../services/docker-compose-ownership-store.js';
import type { DockerComposePreflightService } from '../services/docker-compose-preflight-service.js';
import type { DockerComposeProvider } from '../services/docker-compose-provider.js';
import type { ProjectStore } from '../store/project-store.js';

interface Options extends FastifyPluginOptions {
  projectStore: ProjectStore;
  dockerComposeProvider: Pick<DockerComposeProvider, 'inspect'>;
  dockerComposePreflightService: Pick<DockerComposePreflightService, 'inspect'>;
  dockerComposeLifecycleService: Pick<
    DockerComposeLifecycleService,
    'start' | 'stop' | 'restart' | 'logs'
  >;
  dockerComposeOwnershipStore: Pick<DockerComposeOwnershipStore, 'get'>;
}

interface Params {
  projectId: string;
}

interface TargetBody {
  service: string | null;
}

interface LogsQuery {
  service?: string;
  tail?: number;
}

const paramsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId'],
  properties: {
    projectId: { type: 'string', minLength: 1 },
  },
} as const;

const serviceSchema = {
  type: 'string',
  minLength: 1,
  maxLength: 128,
  pattern: '^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$',
} as const;

const emptyBodySchema = {
  type: 'object',
  additionalProperties: false,
  maxProperties: 0,
} as const;

const targetBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['service'],
  maxProperties: 1,
  properties: {
    service: {
      anyOf: [serviceSchema, { type: 'null' }],
    },
  },
} as const;

const logsQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    service: serviceSchema,
    tail: { type: 'integer', minimum: 1, maximum: 500 },
  },
} as const;

const portBindingSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['targetPort', 'protocol'],
  properties: {
    targetPort: { type: 'integer', minimum: 1, maximum: 65535 },
    publishedPort: { type: 'integer', minimum: 1, maximum: 65535 },
    protocol: { type: 'string', enum: ['tcp', 'udp', 'unknown'] },
  },
} as const;

const composeServiceDefinitionSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'profiles', 'dependsOn', 'ports'],
  properties: {
    name: { type: 'string' },
    image: { type: 'string' },
    profiles: { type: 'array', items: { type: 'string' } },
    dependsOn: { type: 'array', items: { type: 'string' } },
    ports: { type: 'array', items: portBindingSchema },
  },
} as const;

const composeConfigSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['observedAt', 'services'],
  properties: {
    projectName: { type: 'string' },
    observedAt: { type: 'string' },
    services: { type: 'array', items: composeServiceDefinitionSchema },
  },
} as const;

const composeRuntimeServiceSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['service', 'state', 'health', 'ports'],
  properties: {
    service: { type: 'string' },
    state: {
      type: 'string',
      enum: [
        'running',
        'exited',
        'restarting',
        'created',
        'paused',
        'dead',
        'unknown',
      ],
    },
    health: {
      type: 'string',
      enum: ['healthy', 'unhealthy', 'starting', 'none', 'unknown'],
    },
    exitCode: { type: 'integer', minimum: 0 },
    ports: { type: 'array', items: portBindingSchema },
  },
} as const;

const composeRuntimeSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['observedAt', 'services'],
  properties: {
    observedAt: { type: 'string' },
    services: { type: 'array', items: composeRuntimeServiceSchema },
  },
} as const;

const inspectionSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['state', 'observedAt'],
  properties: {
    state: {
      type: 'string',
      enum: [
        'available',
        'runtime-unavailable',
        'docker-missing',
        'compose-unavailable',
        'invalid-output',
      ],
    },
    observedAt: { type: 'string' },
    config: composeConfigSchema,
    runtime: composeRuntimeSchema,
    diagnostic: { type: 'string' },
  },
} as const;

const preflightConflictSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['port', 'services', 'reason'],
  properties: {
    port: { type: 'integer', minimum: 1, maximum: 65535 },
    services: { type: 'array', items: { type: 'string' } },
    reason: {
      type: 'string',
      enum: ['occupied', 'reserved', 'duplicate-declaration'],
    },
    suggestedPort: { type: 'integer', minimum: 1, maximum: 65535 },
  },
} as const;

const preflightSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['state', 'inspectedAt', 'conflicts'],
  properties: {
    state: { type: 'string', enum: ['ready', 'blocked', 'unavailable'] },
    inspectedAt: { type: 'string' },
    conflicts: { type: 'array', items: preflightConflictSchema },
    diagnostic: { type: 'string' },
  },
} as const;

const ownershipSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['owned'],
  properties: {
    owned: { type: 'boolean' },
    startedAt: { type: 'string' },
  },
} as const;

const snapshotSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['inspection', 'ownership'],
  properties: {
    inspection: inspectionSchema,
    preflight: preflightSchema,
    ownership: ownershipSchema,
  },
} as const;

const startResultSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['state', 'preflight'],
  properties: {
    state: { type: 'string', enum: ['started', 'started-unverified'] },
    preflight: preflightSchema,
    inspection: inspectionSchema,
    diagnostic: { type: 'string' },
  },
} as const;

const mutationResultSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['state'],
  properties: {
    state: {
      type: 'string',
      enum: [
        'stopped',
        'stopped-unverified',
        'restarted',
        'restarted-unverified',
      ],
    },
    inspection: inspectionSchema,
    diagnostic: { type: 'string' },
  },
} as const;

const operationResponseSchema = (resultSchema: object) =>
  ({
    type: 'object',
    additionalProperties: false,
    required: ['result', 'snapshot'],
    properties: {
      result: resultSchema,
      snapshot: snapshotSchema,
    },
  }) as const;

const logSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['content', 'truncated', 'masked', 'redactionCount', 'readAt'],
  properties: {
    content: { type: 'string' },
    truncated: { type: 'boolean' },
    masked: { type: 'boolean' },
    redactionCount: { type: 'integer', minimum: 0 },
    readAt: { type: 'string' },
  },
} as const;

function requireProject(store: ProjectStore, projectId: string): Project {
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

function throwLifecycleApiError(error: unknown): never {
  if (!(error instanceof DockerComposeLifecycleError)) throw error;

  let statusCode = 500;
  let code: ApiErrorCode = 'DOCKER_ACTION_FAILED';

  switch (error.code) {
    case 'COMPOSE_PREFLIGHT_BLOCKED':
      statusCode = 409;
      code = 'DOCKER_PORT_CONFLICT';
      break;
    case 'COMPOSE_OWNERSHIP_REQUIRED':
    case 'COMPOSE_OWNERSHIP_MISMATCH':
      statusCode = 409;
      code = 'CONFLICT';
      break;
    case 'COMPOSE_SERVICE_INVALID':
      statusCode = 404;
      code = 'DOCKER_SERVICE_NOT_FOUND';
      break;
    case 'COMPOSE_UNAVAILABLE':
    case 'COMPOSE_PREFLIGHT_UNAVAILABLE':
      statusCode = 503;
      code = 'DOCKER_UNAVAILABLE';
      break;
  }

  throw new ApiError({
    statusCode,
    code,
    message: error.message,
  });
}

async function readSnapshot(options: Options, project: Project) {
  const inspection = await options.dockerComposeProvider.inspect(project);
  const preflight = inspection.config
    ? await options.dockerComposePreflightService.inspect(
        project,
        inspection.config,
        inspection.runtime,
      )
    : undefined;
  const ownership = await options.dockerComposeOwnershipStore.get(project);
  const owned = Boolean(
    ownership &&
    inspection.config?.projectName &&
    ownership.composeProjectName === inspection.config.projectName,
  );

  return {
    inspection,
    ...(preflight ? { preflight } : {}),
    ownership: {
      owned,
      ...(owned && ownership ? { startedAt: ownership.startedAt } : {}),
    },
  };
}

export const dockerComposeRoutes: FastifyPluginAsync<Options> = async (
  app,
  options,
) => {
  app.get<{ Params: Params }>(
    '/projects/:projectId/docker-compose',
    {
      schema: {
        params: paramsSchema,
        response: {
          200: snapshotSchema,
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) =>
      readSnapshot(
        options,
        requireProject(options.projectStore, request.params.projectId),
      ),
  );

  app.post<{ Params: Params; Body: Record<string, never> }>(
    '/projects/:projectId/docker-compose/start',
    {
      schema: {
        params: paramsSchema,
        body: emptyBodySchema,
        response: {
          200: operationResponseSchema(startResultSchema),
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
        const result =
          await options.dockerComposeLifecycleService.start(project);
        return { result, snapshot: await readSnapshot(options, project) };
      } catch (error) {
        throwLifecycleApiError(error);
      }
    },
  );

  app.post<{ Params: Params; Body: TargetBody }>(
    '/projects/:projectId/docker-compose/stop',
    {
      schema: {
        params: paramsSchema,
        body: targetBodySchema,
        response: {
          200: operationResponseSchema(mutationResultSchema),
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
        const result = await options.dockerComposeLifecycleService.stop(
          project,
          request.body.service ?? undefined,
        );
        return { result, snapshot: await readSnapshot(options, project) };
      } catch (error) {
        throwLifecycleApiError(error);
      }
    },
  );

  app.post<{ Params: Params; Body: TargetBody }>(
    '/projects/:projectId/docker-compose/restart',
    {
      schema: {
        params: paramsSchema,
        body: targetBodySchema,
        response: {
          200: operationResponseSchema(mutationResultSchema),
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
        const result = await options.dockerComposeLifecycleService.restart(
          project,
          request.body.service ?? undefined,
        );
        return { result, snapshot: await readSnapshot(options, project) };
      } catch (error) {
        throwLifecycleApiError(error);
      }
    },
  );

  app.get<{ Params: Params; Querystring: LogsQuery }>(
    '/projects/:projectId/docker-compose/logs',
    {
      schema: {
        params: paramsSchema,
        querystring: logsQuerySchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['logs'],
            properties: { logs: logSchema },
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
          logs: await options.dockerComposeLifecycleService.logs(project, {
            ...(request.query.service
              ? { service: request.query.service }
              : {}),
            ...(request.query.tail ? { tail: request.query.tail } : {}),
          }),
        };
      } catch (error) {
        throwLifecycleApiError(error);
      }
    },
  );
};
