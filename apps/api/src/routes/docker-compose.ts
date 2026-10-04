import type { Project } from '@dev-dashboard/contracts';
import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';

import { ApiError, type ApiErrorCode } from '../http/api-error.js';
import { commonErrorResponseSchemas } from '../http/response-schemas.js';
import {
  DockerComposeLifecycleConfirmationError,
  type DockerComposeLifecycleConfirmationService,
  type DockerComposeLifecycleOperation,
} from '../services/docker-compose-lifecycle-confirmation-service.js';
import {
  DockerComposeLifecycleExecutionError,
  type DockerComposeLifecycleExecutionService,
} from '../services/docker-compose-lifecycle-execution-service.js';
import {
  DockerComposeLifecycleError,
  type DockerComposeLifecycleService,
} from '../services/docker-compose-lifecycle-service.js';
import type { DockerComposeOwnershipStore } from '../services/docker-compose-ownership-store.js';
import type { DockerComposePreflightService } from '../services/docker-compose-preflight-service.js';
import type { DockerComposeProvider } from '../services/docker-compose-provider.js';
import {
  primaryEnvironmentInstanceId,
  type DevelopmentEnvironmentInstanceStore,
} from '../store/development-environment-instance-store.js';
import type { ProjectStore } from '../store/project-store.js';

interface Options extends FastifyPluginOptions {
  projectStore: ProjectStore;
  developmentEnvironmentInstanceStore: DevelopmentEnvironmentInstanceStore;
  dockerComposeProvider: Pick<DockerComposeProvider, 'inspect'>;
  dockerComposePreflightService: Pick<DockerComposePreflightService, 'inspect'>;
  dockerComposeLifecycleService: Pick<
    DockerComposeLifecycleService,
    'start' | 'stop' | 'restart' | 'logs' | 'reconcile'
  >;
  dockerComposeLifecycleConfirmationService: Pick<
    DockerComposeLifecycleConfirmationService,
    'prepare'
  >;
  dockerComposeLifecycleExecutionService: Pick<
    DockerComposeLifecycleExecutionService,
    'start' | 'latest'
  >;
  dockerComposeOwnershipStore: Pick<DockerComposeOwnershipStore, 'get'>;
}

interface Params {
  projectId: string;
}

interface TargetBody {
  service: string | null;
}

interface LifecycleConfirmationBody extends TargetBody {
  operation: DockerComposeLifecycleOperation;
}

interface LifecycleExecutionBody extends LifecycleConfirmationBody {
  confirmationToken: string;
}

interface EnvironmentQuery {
  environmentInstanceId?: string;
}

interface LogsQuery extends EnvironmentQuery {
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

const lifecycleOperationSchema = {
  type: 'string',
  enum: ['start', 'stop', 'restart'],
} as const;

const lifecycleConfirmationBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['operation', 'service'],
  maxProperties: 2,
  properties: {
    operation: lifecycleOperationSchema,
    service: {
      anyOf: [serviceSchema, { type: 'null' }],
    },
  },
} as const;

const lifecycleExecutionBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['operation', 'service', 'confirmationToken'],
  maxProperties: 3,
  properties: {
    operation: lifecycleOperationSchema,
    service: {
      anyOf: [serviceSchema, { type: 'null' }],
    },
    confirmationToken: {
      type: 'string',
      minLength: 1,
      maxLength: 256,
    },
  },
} as const;

const environmentQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    environmentInstanceId: {
      type: 'string',
      minLength: 1,
      maxLength: 512,
    },
  },
} as const;

const logsQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ...environmentQuerySchema.properties,
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

const reconciliationSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['state'],
  properties: {
    state: {
      type: 'string',
      enum: ['unchanged', 'released', 'unavailable'],
    },
    diagnostic: { type: 'string' },
  },
} as const;

const ownershipSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['owned', 'reconciliation'],
  properties: {
    owned: { type: 'boolean' },
    startedAt: { type: 'string' },
    reconciliation: reconciliationSchema,
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

const lifecycleConfirmationSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'token',
    'projectId',
    'environmentInstanceId',
    'operation',
    'expiresAt',
  ],
  properties: {
    token: { type: 'string' },
    projectId: { type: 'string' },
    environmentInstanceId: { type: 'string' },
    operation: lifecycleOperationSchema,
    service: { type: 'string' },
    expiresAt: { type: 'string' },
  },
} as const;

const lifecycleExecutionSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'projectId',
    'environmentInstanceId',
    'operation',
    'status',
    'stage',
    'cancelSupported',
    'startedAt',
  ],
  properties: {
    id: { type: 'string' },
    projectId: { type: 'string' },
    environmentInstanceId: { type: 'string' },
    operation: lifecycleOperationSchema,
    service: { type: 'string' },
    status: {
      type: 'string',
      enum: ['queued', 'running', 'succeeded', 'failed'],
    },
    stage: {
      type: 'string',
      enum: ['queued', 'mutating', 'completed', 'failed'],
    },
    cancelSupported: { type: 'boolean', enum: [false] },
    startedAt: { type: 'string' },
    finishedAt: { type: 'string' },
    resultState: { type: 'string' },
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

function requireComposeTarget(
  options: Options,
  projectId: string,
  environmentInstanceId?: string,
): { project: Project; environmentInstanceId: string } {
  const project = requireProject(options.projectStore, projectId);
  const executionContext =
    options.developmentEnvironmentInstanceStore.resolveForProject(
      project.id,
      environmentInstanceId,
    );

  if (!executionContext) {
    throw new ApiError({
      statusCode: 404,
      code: 'ENVIRONMENT_INSTANCE_NOT_FOUND',
      message: 'Ambiente de desenvolvimento não encontrado para este projeto.',
    });
  }

  if (executionContext.runtime !== 'host') {
    throw new ApiError({
      statusCode: 409,
      code: 'DOCKER_UNAVAILABLE',
      message:
        'Docker Compose ainda está disponível somente para ambientes host.',
    });
  }

  const scopedProject =
    executionContext.environmentInstanceId ===
    primaryEnvironmentInstanceId(project.id)
      ? project
      : {
          ...project,
          id: executionContext.environmentInstanceId,
          path: executionContext.cwd,
        };

  return {
    project: scopedProject,
    environmentInstanceId: executionContext.environmentInstanceId,
  };
}

function requireComposeProject(
  options: Options,
  projectId: string,
  environmentInstanceId?: string,
): Project {
  return requireComposeTarget(options, projectId, environmentInstanceId)
    .project;
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
    case 'COMPOSE_RECOVERY_REQUIRED':
    case 'COMPOSE_MUTATION_IN_PROGRESS':
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

function throwExecutionApiError(error: unknown): never {
  if (error instanceof DockerComposeLifecycleConfirmationError) {
    throw new ApiError({
      statusCode: error.code === 'COMPOSE_CONFIRMATION_EXPIRED' ? 409 : 400,
      code:
        error.code === 'COMPOSE_CONFIRMATION_EXPIRED'
          ? 'CONFLICT'
          : 'VALIDATION_ERROR',
      message: error.message,
    });
  }
  if (error instanceof DockerComposeLifecycleExecutionError) {
    throw new ApiError({
      statusCode:
        error.code === 'COMPOSE_EXECUTION_ALREADY_RUNNING' ? 409 : 404,
      code:
        error.code === 'COMPOSE_EXECUTION_ALREADY_RUNNING'
          ? 'CONFLICT'
          : 'NOT_FOUND',
      message: error.message,
    });
  }
  throw error;
}

async function readSnapshot(options: Options, project: Project) {
  const inspection = await options.dockerComposeProvider.inspect(project);
  const reconciliation = await options.dockerComposeLifecycleService.reconcile(
    project,
    inspection,
  );
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
      reconciliation,
    },
  };
}

export const dockerComposeRoutes: FastifyPluginAsync<Options> = async (
  app,
  options,
) => {
  app.get<{ Params: Params; Querystring: EnvironmentQuery }>(
    '/projects/:projectId/docker-compose',
    {
      schema: {
        params: paramsSchema,
        querystring: environmentQuerySchema,
        response: {
          200: snapshotSchema,
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) =>
      readSnapshot(
        options,
        requireComposeProject(
          options,
          request.params.projectId,
          request.query.environmentInstanceId,
        ),
      ),
  );

  app.post<{
    Params: Params;
    Querystring: EnvironmentQuery;
    Body: LifecycleConfirmationBody;
  }>(
    '/projects/:projectId/docker-compose/lifecycle-confirmations',
    {
      schema: {
        params: paramsSchema,
        querystring: environmentQuerySchema,
        body: lifecycleConfirmationBodySchema,
        response: {
          201: {
            type: 'object',
            additionalProperties: false,
            required: ['confirmation'],
            properties: { confirmation: lifecycleConfirmationSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      const target = requireComposeTarget(
        options,
        request.params.projectId,
        request.query.environmentInstanceId,
      );
      const confirmation =
        options.dockerComposeLifecycleConfirmationService.prepare(
          request.params.projectId,
          target.environmentInstanceId,
          request.body.operation,
          request.body.service ?? undefined,
        );
      return reply.code(201).send({ confirmation });
    },
  );

  app.post<{
    Params: Params;
    Querystring: EnvironmentQuery;
    Body: LifecycleExecutionBody;
  }>(
    '/projects/:projectId/docker-compose/lifecycle-executions',
    {
      schema: {
        params: paramsSchema,
        querystring: environmentQuerySchema,
        body: lifecycleExecutionBodySchema,
        response: {
          202: {
            type: 'object',
            additionalProperties: false,
            required: ['execution'],
            properties: { execution: lifecycleExecutionSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      const target = requireComposeTarget(
        options,
        request.params.projectId,
        request.query.environmentInstanceId,
      );
      try {
        const execution = options.dockerComposeLifecycleExecutionService.start(
          request.params.projectId,
          target.environmentInstanceId,
          target.project,
          request.body.operation,
          request.body.confirmationToken,
          request.body.service ?? undefined,
        );
        return reply.code(202).send({ execution });
      } catch (error) {
        throwExecutionApiError(error);
      }
    },
  );

  app.get<{ Params: Params; Querystring: EnvironmentQuery }>(
    '/projects/:projectId/docker-compose/lifecycle-execution',
    {
      schema: {
        params: paramsSchema,
        querystring: environmentQuerySchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['execution'],
            properties: {
              execution: {
                anyOf: [lifecycleExecutionSchema, { type: 'null' }],
              },
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const target = requireComposeTarget(
        options,
        request.params.projectId,
        request.query.environmentInstanceId,
      );
      return {
        execution:
          options.dockerComposeLifecycleExecutionService.latest(
            request.params.projectId,
            target.environmentInstanceId,
          ) ?? null,
      };
    },
  );

  app.post<{
    Params: Params;
    Querystring: EnvironmentQuery;
    Body: Record<string, never>;
  }>(
    '/projects/:projectId/docker-compose/start',
    {
      schema: {
        params: paramsSchema,
        querystring: environmentQuerySchema,
        body: emptyBodySchema,
        response: {
          200: operationResponseSchema(startResultSchema),
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = requireComposeProject(
        options,
        request.params.projectId,
        request.query.environmentInstanceId,
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

  app.post<{ Params: Params; Querystring: EnvironmentQuery; Body: TargetBody }>(
    '/projects/:projectId/docker-compose/stop',
    {
      schema: {
        params: paramsSchema,
        querystring: environmentQuerySchema,
        body: targetBodySchema,
        response: {
          200: operationResponseSchema(mutationResultSchema),
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = requireComposeProject(
        options,
        request.params.projectId,
        request.query.environmentInstanceId,
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

  app.post<{ Params: Params; Querystring: EnvironmentQuery; Body: TargetBody }>(
    '/projects/:projectId/docker-compose/restart',
    {
      schema: {
        params: paramsSchema,
        querystring: environmentQuerySchema,
        body: targetBodySchema,
        response: {
          200: operationResponseSchema(mutationResultSchema),
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = requireComposeProject(
        options,
        request.params.projectId,
        request.query.environmentInstanceId,
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
      const project = requireComposeProject(
        options,
        request.params.projectId,
        request.query.environmentInstanceId,
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
