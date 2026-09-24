import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';

import { ApiError } from '../http/api-error.js';
import { commonErrorResponseSchemas } from '../http/response-schemas.js';
import type { DevContainerDiscoveryService } from '../services/dev-container-discovery-service.js';
import {
  DevContainerLifecyclePlanningError,
  type DevContainerLifecyclePlanningService,
} from '../services/dev-container-lifecycle-planning-service.js';
import type { ProjectStore } from '../store/project-store.js';

interface Options extends FastifyPluginOptions {
  projectStore: ProjectStore;
  devContainerDiscoveryService: Pick<DevContainerDiscoveryService, 'inspect'>;
  devContainerLifecyclePlanningService: Pick<
    DevContainerLifecyclePlanningService,
    'plan'
  >;
}

interface Params {
  projectId: string;
}

interface LifecyclePreflightQuery {
  environmentInstanceId?: string;
}

const paramsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId'],
  properties: {
    projectId: { type: 'string', minLength: 1 },
  },
} as const;

const lifecyclePreflightQuerySchema = {
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
        enum: ['cleanup-adapter-pending', 'post-create-hooks-deferred'],
      },
    },
    diagnostic: { type: 'string' },
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

      try {
        return {
          preflight: await options.devContainerLifecyclePlanningService.plan(
            project,
            {
              ...(request.query.environmentInstanceId
                ? {
                    environmentInstanceId: request.query.environmentInstanceId,
                  }
                : {}),
            },
          ),
        };
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
    },
  );
};
