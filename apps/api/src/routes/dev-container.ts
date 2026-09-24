import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';

import { ApiError } from '../http/api-error.js';
import { commonErrorResponseSchemas } from '../http/response-schemas.js';
import type { DevContainerDiscoveryService } from '../services/dev-container-discovery-service.js';
import type { ProjectStore } from '../store/project-store.js';

interface Options extends FastifyPluginOptions {
  projectStore: ProjectStore;
  devContainerDiscoveryService: Pick<DevContainerDiscoveryService, 'inspect'>;
}

interface Params {
  projectId: string;
}

const paramsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId'],
  properties: {
    projectId: { type: 'string', minLength: 1 },
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
};
