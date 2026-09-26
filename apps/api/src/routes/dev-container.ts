import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';

import { ApiError } from '../http/api-error.js';
import { commonErrorResponseSchemas } from '../http/response-schemas.js';
import type { DevContainerDiscoveryService } from '../services/dev-container-discovery-service.js';
import {
  DevContainerCleanupError,
  type DevContainerCleanupService,
} from '../services/dev-container-cleanup-service.js';
import {
  DevContainerLifecycleConfirmationError,
  type DevContainerLifecycleConfirmationService,
} from '../services/dev-container-lifecycle-confirmation-service.js';
import {
  DevContainerLifecyclePlanningError,
  type DevContainerLifecyclePlanningService,
} from '../services/dev-container-lifecycle-planning-service.js';
import {
  DevContainerRebuildError,
  DevContainerStartError,
  type DevContainerStartService,
} from '../services/dev-container-start-service.js';
import {
  DevContainerStopConfirmationError,
  type DevContainerStopConfirmationService,
} from '../services/dev-container-stop-confirmation-service.js';
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
  devContainerStartService: Pick<DevContainerStartService, 'start' | 'rebuild'>;
  devContainerCleanupService?: Pick<
    DevContainerCleanupService,
    'inspect' | 'cleanup'
  >;
  devContainerStopConfirmationService?: Pick<
    DevContainerStopConfirmationService,
    'prepare' | 'consume'
  >;
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

type StopConfirmationBody = LifecycleConfirmationBody;
type StopBody = LifecycleStartBody;

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
    operation: { type: 'string', enum: ['create', 'rebuild'] },
    state: {
      type: 'string',
      enum: ['review', 'blocked', 'unavailable'],
    },
    reason: {
      type: 'string',
      enum: [
        'review-required',
        'rebuild-ownership-required',
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
    operation: { type: 'string', enum: ['create', 'rebuild'] },
    expiresAt: { type: 'string' },
  },
} as const;

const stopConfirmationSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['token', 'environmentInstanceId', 'expiresAt'],
  properties: {
    token: { type: 'string', pattern: '^[a-f0-9]{64}
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

function requireStopServices(options: Options) {
  if (
    !options.devContainerCleanupService ||
    !options.devContainerStopConfirmationService
  ) {
    throw new Error('Dev Container stop services are not configured.');
  }
  return {
    cleanupService: options.devContainerCleanupService,
    confirmationService: options.devContainerStopConfirmationService,
  };
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

function cleanupApiError(error: DevContainerCleanupError): ApiError {
  const statusCode =
    error.code === 'DEV_CONTAINER_CLEANUP_DOCKER_LOOKUP_FAILED' ||
    error.code === 'DEV_CONTAINER_CLEANUP_DOCKER_INSPECT_FAILED' ||
    error.code === 'DEV_CONTAINER_CLEANUP_DOCKER_STOP_FAILED' ||
    error.code === 'DEV_CONTAINER_CLEANUP_DOCKER_REMOVE_FAILED' ||
    error.code === 'DEV_CONTAINER_CLEANUP_OWNERSHIP_RELEASE_FAILED'
      ? 500
      : error.code === 'DEV_CONTAINER_CLEANUP_ENVIRONMENT_NOT_FOUND'
        ? 404
        : 409;
  return new ApiError({
    statusCode,
    code: error.code,
    message: error.message,
  });
}

function stopConfirmationApiError(
  error: DevContainerStopConfirmationError,
): ApiError {
  return new ApiError({
    statusCode: 409,
    code: error.code,
    message: error.message,
  });
}

function rebuildApiError(error: DevContainerRebuildError): ApiError {
  const statusCode =
    error.code === 'DEV_CONTAINER_REBUILD_CLEANUP_FAILED' ||
    error.code === 'DEV_CONTAINER_REBUILD_CREATE_FAILED' ||
    error.code === 'DEV_CONTAINER_REBUILD_ROLLBACK_FAILED'
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

  app.post<{ Params: Params; Body: StopConfirmationBody }>(
    '/projects/:projectId/dev-container/stop-confirmation',
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
              confirmation: stopConfirmationSchema,
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
        const { cleanupService, confirmationService } =
          requireStopServices(options);
        const inspection = await cleanupService.inspect(
          project,
          request.body.environmentInstanceId,
        );
        const confirmation =
          confirmationService.prepare(project, inspection);
        return reply.code(201).send({ confirmation });
      } catch (error) {
        if (error instanceof DevContainerCleanupError) {
          throw cleanupApiError(error);
        }
        if (error instanceof DevContainerStopConfirmationError) {
          throw stopConfirmationApiError(error);
        }
        throw error;
      }
    },
  );

  app.post<{ Params: Params; Body: StopBody }>(
    '/projects/:projectId/dev-container/stop',
    {
      schema: {
        params: paramsSchema,
        body: lifecycleStartBodySchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['result'],
            properties: {
              result: stopResultSchema,
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
      try {
        const { cleanupService, confirmationService } =
          requireStopServices(options);
        const inspection = await cleanupService.inspect(
          project,
          request.body.environmentInstanceId,
        );
        const ownershipToken =
          confirmationService.consume(
            project,
            inspection,
            request.body.confirmationToken,
          );
        const result = await cleanupService.cleanup(
          project,
          inspection.environmentInstanceId,
          ownershipToken,
        );
        return { result };
      } catch (error) {
        if (error instanceof DevContainerCleanupError) {
          throw cleanupApiError(error);
        }
        if (error instanceof DevContainerStopConfirmationError) {
          throw stopConfirmationApiError(error);
        }
        throw error;
      }
    },
  );

  app.post<{ Params: Params; Body: LifecycleStartBody }>(
    '/projects/:projectId/dev-container/rebuild',
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
        const result = await options.devContainerStartService.rebuild(project, {
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
        if (error instanceof DevContainerRebuildError) {
          throw rebuildApiError(error);
        }
        throw error;
      }
    },
  );
};
 },
    environmentInstanceId: { type: 'string' },
    expiresAt: { type: 'string' },
  },
} as const;

const stopResultSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['state', 'environmentInstanceId'],
  properties: {
    state: { type: 'string', enum: ['cleaned', 'already-absent'] },
    environmentInstanceId: { type: 'string' },
    containerId: { type: 'string' },
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

function rebuildApiError(error: DevContainerRebuildError): ApiError {
  const statusCode =
    error.code === 'DEV_CONTAINER_REBUILD_CLEANUP_FAILED' ||
    error.code === 'DEV_CONTAINER_REBUILD_CREATE_FAILED' ||
    error.code === 'DEV_CONTAINER_REBUILD_ROLLBACK_FAILED'
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

  app.post<{ Params: Params; Body: LifecycleStartBody }>(
    '/projects/:projectId/dev-container/rebuild',
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
        const result = await options.devContainerStartService.rebuild(project, {
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
        if (error instanceof DevContainerRebuildError) {
          throw rebuildApiError(error);
        }
        throw error;
      }
    },
  );
};
