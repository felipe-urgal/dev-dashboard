import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';
import type { WebSocket } from 'ws';

import { ApiError, type ApiErrorCode } from '../http/api-error.js';
import { commonErrorResponseSchemas } from '../http/response-schemas.js';
import {
  MigrationMutationConfirmationError,
  type MigrationMutationConfirmationService,
} from '../services/migration-mutation-confirmation-service.js';
import {
  MigrationMutationExecutionError,
  type MigrationMutationExecutionService,
  type MigrationMutationExecutionSnapshot,
} from '../services/migration-mutation-execution-service.js';
import {
  MigrationMutationPlanningError,
  type MigrationMutationPlanInput,
  type MigrationMutationPlanningService,
} from '../services/migration-mutation-planning-service.js';
import type {
  MigrationMutationPlan,
  MigrationMutationPreflight,
} from '../services/migration-mutation-provider.js';
import type { MigrationOverviewService } from '../services/migration-overview-service.js';
import type { ProjectStore } from '../store/project-store.js';

interface Options extends FastifyPluginOptions {
  projectStore: ProjectStore;
  migrationOverviewService: Pick<MigrationOverviewService, 'inspect'>;
  migrationMutationPlanningService: Pick<MigrationMutationPlanningService, 'plan'>;
  migrationMutationConfirmationService: Pick<
    MigrationMutationConfirmationService,
    'prepare'
  >;
  migrationMutationExecutionService:
    | Pick<
        MigrationMutationExecutionService,
        'start' | 'snapshot' | 'attach' | 'cancel'
      >
    | undefined;
}

interface Params {
  projectId: string;
}

interface Querystring {
  database?: string;
}

interface EnvironmentQuery {
  environmentInstanceId: string;
}

interface MutationBody extends MigrationMutationPlanInput {}

interface ConfirmationBody extends MutationBody {
  planHash: string;
}

interface StartBody extends MutationBody {
  confirmationToken: string;
}

const paramsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId'],
  properties: {
    projectId: { type: 'string', minLength: 1 },
  },
} as const;

const databaseSchema = {
  type: 'string',
  minLength: 1,
  maxLength: 128,
  pattern: '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$',
} as const;

const environmentInstanceIdSchema = {
  type: 'string',
  minLength: 1,
  maxLength: 512,
} as const;

const querystringSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    database: databaseSchema,
  },
} as const;

const environmentQuerySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['environmentInstanceId'],
  properties: {
    environmentInstanceId: environmentInstanceIdSchema,
  },
} as const;

const mutationBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['operation'],
  properties: {
    operation: { type: 'string', enum: ['apply'] },
    database: databaseSchema,
    environmentInstanceId: environmentInstanceIdSchema,
  },
} as const;

const confirmationBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['operation', 'planHash'],
  properties: {
    ...mutationBodySchema.properties,
    planHash: { type: 'string', pattern: '^[a-f0-9]{64}$' },
  },
} as const;

const startBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['operation', 'confirmationToken'],
  properties: {
    ...mutationBodySchema.properties,
    confirmationToken: { type: 'string', minLength: 1, maxLength: 256 },
  },
} as const;

const migrationEntrySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id'],
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
  },
} as const;

const migrationOverviewSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'provider',
    'status',
    'database',
    'applied',
    'pending',
    'observedAt',
    'evidence',
    'warnings',
  ],
  properties: {
    provider: { type: 'string' },
    status: {
      type: 'string',
      enum: ['up-to-date', 'pending', 'unavailable', 'unknown'],
    },
    database: { type: 'string' },
    applied: { type: 'array', items: migrationEntrySchema },
    pending: { type: 'array', items: migrationEntrySchema },
    observedAt: { type: 'string' },
    evidence: { type: 'string' },
    warnings: { type: 'array', items: { type: 'string' } },
  },
} as const;

const mutationPreflightSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['state', 'reason', 'observedAt', 'evidence'],
  properties: {
    state: { type: 'string', enum: ['ready', 'blocked', 'unavailable'] },
    reason: {
      type: 'string',
      enum: [
        'ready',
        'provider-unavailable',
        'runtime-unsupported',
        'provider-evidence-mismatch',
        'database-evidence-mismatch',
        'nothing-pending',
        'inspection-inconclusive',
        'provider-plan-invalid',
      ],
    },
    observedAt: { type: 'string' },
    evidence: { type: 'string' },
    diagnostic: { type: 'string' },
  },
} as const;

const mutationPlanSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'projectId',
    'provider',
    'operation',
    'database',
    'environmentInstanceId',
    'runtime',
    'createdAt',
    'planHash',
    'preflight',
  ],
  properties: {
    projectId: { type: 'string' },
    provider: { type: 'string' },
    operation: { type: 'string', enum: ['apply'] },
    database: { type: 'string' },
    environmentInstanceId: { type: 'string' },
    runtime: { type: 'string', enum: ['host', 'devcontainer'] },
    createdAt: { type: 'string' },
    overviewObservedAt: { type: 'string' },
    planHash: { type: 'string' },
    preflight: mutationPreflightSchema,
  },
} as const;

const confirmationSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['token', 'planHash', 'expiresAt'],
  properties: {
    token: { type: 'string' },
    planHash: { type: 'string' },
    expiresAt: { type: 'string' },
  },
} as const;

const executionSnapshotSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'provider',
    'operation',
    'database',
    'environmentInstanceId',
    'planHash',
    'status',
    'buffer',
    'truncated',
    'exitCode',
    'exitSignal',
    'startedAt',
    'endedAt',
  ],
  properties: {
    provider: { type: 'string' },
    operation: { type: 'string', enum: ['apply'] },
    database: { type: 'string' },
    environmentInstanceId: { type: 'string' },
    planHash: { type: 'string' },
    status: { type: 'string', enum: ['running', 'exited'] },
    buffer: { type: 'string' },
    truncated: { type: 'boolean' },
    exitCode: { type: ['integer', 'null'] },
    exitSignal: { type: ['integer', 'null'] },
    startedAt: { type: 'string' },
    endedAt: { type: ['string', 'null'] },
  },
} as const;

const nullableExecutionSnapshotSchema = {
  ...executionSnapshotSchema,
  type: ['object', 'null'],
} as const;

function requireProject(store: ProjectStore, projectId: string) {
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

function publicPlan(plan: MigrationMutationPlan) {
  return {
    projectId: plan.projectId,
    provider: plan.provider,
    operation: plan.operation,
    database: plan.database,
    environmentInstanceId: plan.environmentInstanceId,
    runtime: plan.runtime,
    createdAt: plan.createdAt,
    ...(plan.overviewObservedAt
      ? { overviewObservedAt: plan.overviewObservedAt }
      : {}),
    planHash: plan.planHash,
    preflight: plan.preflight,
  };
}

function planningApiError(error: MigrationMutationPlanningError): ApiError {
  return new ApiError({
    statusCode: 404,
    code: 'ENVIRONMENT_INSTANCE_NOT_FOUND',
    message: error.message,
  });
}

const confirmationErrorCodes: Record<
  MigrationMutationConfirmationError['code'],
  ApiErrorCode
> = {
  MIGRATION_MUTATION_PLAN_NOT_READY: 'MIGRATION_MUTATION_PLAN_NOT_READY',
  MIGRATION_MUTATION_CONFIRMATION_REQUIRED:
    'MIGRATION_MUTATION_CONFIRMATION_REQUIRED',
};

function confirmationApiError(
  error: MigrationMutationConfirmationError,
): ApiError {
  return new ApiError({
    statusCode: 409,
    code: confirmationErrorCodes[error.code],
    message: error.message,
  });
}

const executionErrorResponses: Record<
  MigrationMutationExecutionError['code'],
  { statusCode: number; code: ApiErrorCode }
> = {
  MIGRATION_MUTATION_EXECUTION_CONTEXT_CHANGED: {
    statusCode: 409,
    code: 'MIGRATION_MUTATION_EXECUTION_CONTEXT_CHANGED',
  },
  MIGRATION_MUTATION_ALREADY_RUNNING: {
    statusCode: 409,
    code: 'MIGRATION_MUTATION_ALREADY_RUNNING',
  },
  MIGRATION_MUTATION_EXECUTION_NOT_FOUND: {
    statusCode: 404,
    code: 'MIGRATION_MUTATION_EXECUTION_NOT_FOUND',
  },
  MIGRATION_MUTATION_START_FAILED: {
    statusCode: 500,
    code: 'MIGRATION_MUTATION_START_FAILED',
  },
};

function executionApiError(error: MigrationMutationExecutionError): ApiError {
  const mapped = executionErrorResponses[error.code];
  return new ApiError({
    statusCode: mapped.statusCode,
    code: mapped.code,
    message: error.message,
  });
}

function requireExecutionService(
  service: Options['migrationMutationExecutionService'],
) {
  if (!service) {
    throw new ApiError({
      statusCode: 503,
      code: 'MIGRATION_MUTATION_EXECUTION_UNAVAILABLE',
      message: 'Execução de migrations não está disponível neste runtime.',
    });
  }
  return service;
}

function sendJson(socket: WebSocket, message: unknown): void {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

async function planMutation(
  options: Options,
  projectId: string,
  input: MigrationMutationPlanInput,
): Promise<MigrationMutationPlan> {
  const project = requireProject(options.projectStore, projectId);
  try {
    return await options.migrationMutationPlanningService.plan(project, input);
  } catch (error) {
    if (error instanceof MigrationMutationPlanningError) {
      throw planningApiError(error);
    }
    throw error;
  }
}

export const migrationRoutes: FastifyPluginAsync<Options> = async (
  app,
  options,
) => {
  app.get<{
    Params: Params;
    Querystring: Querystring;
  }>(
    '/projects/:projectId/migrations',
    {
      schema: {
        params: paramsSchema,
        querystring: querystringSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['migration'],
            properties: {
              migration: migrationOverviewSchema,
            },
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
      return {
        migration: await options.migrationOverviewService.inspect(
          project,
          request.query.database,
        ),
      };
    },
  );

  app.post<{ Params: Params; Body: MutationBody }>(
    '/projects/:projectId/migrations/mutations/plan',
    {
      schema: {
        params: paramsSchema,
        body: mutationBodySchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['plan'],
            properties: { plan: mutationPlanSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => ({
      plan: publicPlan(
        await planMutation(options, request.params.projectId, request.body),
      ),
    }),
  );

  app.post<{ Params: Params; Body: ConfirmationBody }>(
    '/projects/:projectId/migrations/mutations/confirmation',
    {
      schema: {
        params: paramsSchema,
        body: confirmationBodySchema,
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
      const plan = await planMutation(
        options,
        request.params.projectId,
        request.body,
      );
      if (plan.planHash !== request.body.planHash) {
        throw new ApiError({
          statusCode: 409,
          code: 'MIGRATION_MUTATION_PLAN_CHANGED',
          message:
            'O plano de migrations mudou desde a última inspeção. Revise o estado atual antes de executar.',
        });
      }

      try {
        const confirmation =
          options.migrationMutationConfirmationService.prepare(plan);
        return reply.code(201).send({
          confirmation: {
            token: confirmation.token,
            planHash: confirmation.planHash,
            expiresAt: confirmation.expiresAt,
          },
        });
      } catch (error) {
        if (error instanceof MigrationMutationConfirmationError) {
          throw confirmationApiError(error);
        }
        throw error;
      }
    },
  );

  app.post<{ Params: Params; Body: StartBody }>(
    '/projects/:projectId/migrations/mutations/start',
    {
      schema: {
        params: paramsSchema,
        body: startBodySchema,
        response: {
          201: {
            type: 'object',
            additionalProperties: false,
            required: ['snapshot'],
            properties: { snapshot: executionSnapshotSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      const project = requireProject(
        options.projectStore,
        request.params.projectId,
      );
      const executionService = requireExecutionService(
        options.migrationMutationExecutionService,
      );
      try {
        const snapshot = await executionService.start(
          project,
          request.body,
          request.body.confirmationToken,
        );
        return reply.code(201).send({ snapshot });
      } catch (error) {
        if (error instanceof MigrationMutationPlanningError) {
          throw planningApiError(error);
        }
        if (error instanceof MigrationMutationConfirmationError) {
          throw confirmationApiError(error);
        }
        if (error instanceof MigrationMutationExecutionError) {
          throw executionApiError(error);
        }
        throw error;
      }
    },
  );

  app.get<{ Params: Params; Querystring: EnvironmentQuery }>(
    '/projects/:projectId/migrations/mutations/status',
    {
      schema: {
        params: paramsSchema,
        querystring: environmentQuerySchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['snapshot'],
            properties: { snapshot: nullableExecutionSnapshotSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      requireProject(options.projectStore, request.params.projectId);
      const executionService = requireExecutionService(
        options.migrationMutationExecutionService,
      );
      return {
        snapshot:
          executionService.snapshot(
            request.params.projectId,
            request.query.environmentInstanceId,
          ) ?? null,
      };
    },
  );

  app.post<{ Params: Params; Querystring: EnvironmentQuery }>(
    '/projects/:projectId/migrations/mutations/cancel',
    {
      schema: {
        params: paramsSchema,
        querystring: environmentQuerySchema,
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {},
        },
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
      requireProject(options.projectStore, request.params.projectId);
      const executionService = requireExecutionService(
        options.migrationMutationExecutionService,
      );
      executionService.cancel(
        request.params.projectId,
        request.query.environmentInstanceId,
      );
      return { ok: true };
    },
  );

  app.get<{ Params: Params; Querystring: EnvironmentQuery }>(
    '/projects/:projectId/migrations/mutations/connect',
    {
      websocket: true,
      schema: {
        params: paramsSchema,
        querystring: environmentQuerySchema,
      },
    },
    (socket, request) => {
      if (!options.projectStore.findProject(request.params.projectId)) {
        socket.close(1008, 'Projeto não encontrado');
        return;
      }
      const executionService = options.migrationMutationExecutionService;
      if (!executionService) {
        socket.close(1011, 'Execução de migrations indisponível');
        return;
      }

      let handle;
      try {
        handle = executionService.attach(
          request.params.projectId,
          request.query.environmentInstanceId,
          (chunk) => sendJson(socket, { type: 'output', data: chunk }),
          (snapshot: MigrationMutationExecutionSnapshot) =>
            sendJson(socket, {
              type: 'exit',
              exitCode: snapshot.exitCode,
              exitSignal: snapshot.exitSignal,
            }),
        );
      } catch (error) {
        if (
          error instanceof MigrationMutationExecutionError &&
          error.code === 'MIGRATION_MUTATION_EXECUTION_NOT_FOUND'
        ) {
          sendJson(socket, {
            type: 'error',
            message: error.message,
          });
          socket.close(1000, 'Nenhuma execução em andamento');
          return;
        }
        throw error;
      }

      sendJson(socket, { type: 'ready', snapshot: handle.snapshot });
      socket.once('close', handle.detach);
      socket.once('error', handle.detach);
    },
  );
};
