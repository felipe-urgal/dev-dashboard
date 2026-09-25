import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';

import { ApiError } from '../http/api-error.js';
import { commonErrorResponseSchemas } from '../http/response-schemas.js';
import type { DevContainerDiscoveryService } from '../services/dev-container-discovery-service.js';
import {
  DevContainerLifecycleConfirmationError,
  type DevContainerLifecycleConfirmationService,
} from '../services/dev-container-lifecycle-confirmation-service.js';
import {
  DevContainerLifecyclePlanningError,
  type DevContainerLifecyclePlanningService,
} from '../services/dev-container-lifecycle-planning-service.js';
import {
  DevContainerStartError,
  type DevContainerStartService,
} from '../services/dev-container-start-service.js';
import type { ProjectStore } from '../store/project-store.js';

interface Options extends FastifyPluginOptions {
  projectStore: ProjectStore;
  devContainerDiscoveryService: Pick<DevContainerDiscoveryService, 'inspect'>;
  devContainerLifecyclePlanningService: Pick<
    DevContainerLifecyclePlanningService,
    'plan'
  >;
  devContainerLifecycleConfirmationService: Pick<
    DevContainerLifecycleConfirmationService,
    'prepare'
  >;
  devContainerStartService: Pick<DevContainerStartService, 'start'>;
}

interface Params {
  projectId: string;
}

interface LifecyclePreflightQuery {
  environmentInstanceId?: string;
}

interface LifecycleConfirmationBody {
  environmentInstanceId?: string;
}

interface LifecycleStartBody extends LifecycleConfirmationBody {
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

const environmentInstanceIdSchema = {
  type: 'string',
  minLength: 1,
  maxLength: 512,
} as const;

const lifecyclePreflightQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    environmentInstanceId: environmentInstanceIdSchema,
  },
} as const;

const lifecycleConfirmationBodySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    environmentInstanceId: environmentInstanceIdSchema,
  },
} as const;

const lifecycleStartBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['confirmationToken'],
  properties: {
    environmentInstanceId: environmentInstanceIdSchema,
    confirmationToken: {
      type: 'string',
      minLength: 1,
      maxLength: 256,
      pattern: '^[a-f0-9]{64}$',
    },
  },
} as const;

const configurationSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'lifecycleHooks'],
  properties: {
    kind: {
      type: 'string',
      enum: ['image', 'dockerfile', 'compose', 'unknown'],
    },
    name: { type: 'string' },
    service: { type: 'string' },
    lifecycleHooks: {
      type: 'array',
      items: {
        type: 'string',
        enum: [
          'initializeCommand',
          'onCreateCommand',
          'updateContentCommand',
          'postCreateCommand',
          'postStartCommand',
          'postAttachCommand',
        ],
      },
    },
  },
} as const;

const lifecyclePreflightSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'projectId',
    'operation',
    'state',
    'reason',
    'observedAt',
    'environmentInstanceId',
    'runtime',
    'executionEnabled',
    'requiresConfirmation',
    'limitations',
    'diagnostic',
  ],
  properties: {
    projectId: { type: 'string' },
    operation: { type: 'string', enum: ['create'] },
    state: {
      type: 'string',
      enum: ['review', 'blocked', 'unavailable'],
    },
    reason: {
      type: 'string',
      enum: [
        'review-required',
        'runtime-not-host',
        'discovery-not-ready',
        'initialize-command-declared',
        'compose-ownership-required',
        'configuration-kind-unknown',
      ],
    },
    observedAt: { type: 'string' },
    environmentInstanceId: { type: 'string' },
    runtime: { type: 'string', enum: ['host', 'devcontainer'] },
    executionEnabled: { type: 'boolean', enum: [false] },
    requiresConfirmation: { type: 'boolean' },
    discoveryState: {
      type: 'string',
      enum: [
        'not-configured',
        'available',
        'cli-missing',
        'unavailable',
        'invalid-output',
      ],
    },
    configSource: {
      type: 'string',
      enum: ['.devcontainer/devcontainer.json', '.devcontainer.json'],
    },
    cliVersion: { type: 'string' },
    configuration: configurationSchema,
    limitations: {
      type: 'array',
      items: {
        type: 'string',
        enum: ['post-create-hooks-deferred'],
      },
    },
    diagnostic: { type: 'string' },
  },
} as const;

const lifecycleConfirmationSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['token', 'environmentInstanceId', 'operation', 'expiresAt'],
  properties: {
    token: { type: 'string', pattern: '^[a-f0-9]{64}$' },
    environmentInstanceId: { type: 'string' },
    operation: { type: 'string', enum: ['create'] },
    expiresAt: { type: 'string' },
  },
} as const;

const lifecycleStartResultSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['environmentInstanceId', 'runtime', 'containerId'],
  properties: {
    environmentInstanceId: { type: 'string' },
    runtime: { type: 'string', enum: ['devcontainer'] },
    containerId: { type: 'string' },
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
        'not-configured',
        'available',
        'cli-missing',
        'unavailable',
        'invalid-output',
      ],
    },
    observedAt: { type: 'string' },
    configSource: {
      type: 'string',
      enum: ['.devcontainer/devcontainer.json', '.devcontainer.json'],
    },
    cliVersion: { type: 'string' },
    configuration: configurationSchema,
    diagnostic: { type: 'string' },
  },
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

async function planLifecycle(
  options: Options,
  project: ReturnType<typeof requireProject>,
  environmentInstanceId?: string,
) {
  try {
    return await options.devContainerLifecyclePlanningService.plan(project, {
      ...(environmentInstanceId ? { environmentInstanceId } : {}),
    });
  } catch (error) {
    if (error instanceof DevContainerLifecyclePlanningError) {
      throw new ApiError({
        statusCode: 404,
        code: 'ENVIRONMENT_INSTANCE_NOT_FOUND',
        message:
          'Ambiente de desenvolvimento não encontrado para este projeto.',
      });
    }
    throw error;
  }
}

function confirmationApiError(
  error: DevContainerLifecycleConfirmationError,
): ApiError {
  return new ApiError({
    statusCode: 409,
    code: error.code,
    message: error.message,
  });
}

function startApiError(error: DevContainerStartError): ApiError {
  const statusCode =
    error.code === 'DEV_CONTAINER_START_COMMAND_FAILED' ||
    error.code === 'DEV_CONTAINER_START_STATE_FAILED' ||
    error.code === 'DEV_CONTAINER_START_ROLLBACK_FAILED'
      ? 500
      : 409;
  return new ApiError({
    statusCode,
    code: error.code,
    message: error.message,
  });
}

export const devContainerRoutes: FastifyPluginAsync<Options> = async (
  app,
  options,
) => {
  app.get<{ Params: Params }>(
    '/projects/:projectId/dev-container',
    {
      schema: {
        params: paramsSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['inspection'],
            properties: {
              inspection: inspectionSchema,
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => ({
      inspection: await options.devContainerDiscoveryService.inspect(
        requireProject(options.projectStore, request.params.projectId),
      ),
    }),
  );

  app.get<{ Params: Params; Querystring: LifecyclePreflightQuery }>(
    '/projects/:projectId/dev-container/lifecycle-preflight',
    {
      schema: {
        params: paramsSchema,
        querystring: lifecyclePreflightQuerySchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['preflight'],
            properties: {
              preflight: lifecyclePreflightSchema,
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
        preflight: await planLifecycle(
          options,
          project,
          request.query.environmentInstanceId,
        ),
      };
    },
  );

  app.post<{ Params: Params; Body: LifecycleConfirmationBody }>(
    '/projects/:projectId/dev-container/lifecycle-confirmation',
    {
      schema: {
        params: paramsSchema,
        body: lifecycleConfirmationBodySchema,
        response: {
          201: {
            type: 'object',
            additionalProperties: false,
            required: ['confirmation'],
            properties: {
              confirmation: lifecycleConfirmationSchema,
            },
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
      const preflight = await planLifecycle(
        options,
        project,
        request.body.environmentInstanceId,
      );

      try {
        const confirmation =
          options.devContainerLifecycleConfirmationService.prepare(preflight);
        return reply.code(201).send({
          confirmation: {
            token: confirmation.token,
            environmentInstanceId: confirmation.environmentInstanceId,
            operation: confirmation.operation,
            expiresAt: confirmation.expiresAt,
          },
        });
      } catch (error) {
        if (error instanceof DevContainerLifecycleConfirmationError) {
          throw confirmationApiError(error);
        }
        throw error;
      }
    },
  );

  app.post<{ Params: Params; Body: LifecycleStartBody }>(
    '/projects/:projectId/dev-container/start',
    {
      schema: {
        params: paramsSchema,
        body: lifecycleStartBodySchema,
        response: {
          201: {
            type: 'object',
            additionalProperties: false,
            required: ['result'],
            properties: {
              result: lifecycleStartResultSchema,
            },
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
      try {
        const result = await options.devContainerStartService.start(project, {
          ...(request.body.environmentInstanceId
            ? { environmentInstanceId: request.body.environmentInstanceId }
            : {}),
          confirmationToken: request.body.confirmationToken,
        });
        return reply.code(201).send({ result });
      } catch (error) {
        if (error instanceof DevContainerLifecyclePlanningError) {
          throw new ApiError({
            statusCode: 404,
            code: 'ENVIRONMENT_INSTANCE_NOT_FOUND',
            message:
              'Ambiente de desenvolvimento não encontrado para este projeto.',
          });
        }
        if (error instanceof DevContainerStartError) {
          throw startApiError(error);
        }
        throw error;
      }
    },
  );
};
