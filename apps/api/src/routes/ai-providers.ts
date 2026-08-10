import type { FastifyPluginAsync } from 'fastify';

import type { AiExecutionMode, AiProviderId } from '@dev-dashboard/contracts';

import { ApiError } from '../http/api-error.js';
import { commonErrorResponseSchemas } from '../http/response-schemas.js';
import {
  AiProviderResolutionError,
  type AiProviderResolver,
} from '../services/ai-provider-resolver.js';
import type { ProjectStore } from '../store/project-store.js';
import { projectParamsSchema, type ProjectParams } from './projects/helpers.js';

interface AiProviderRouteOptions {
  projectStore: ProjectStore;
  aiProviderResolver: AiProviderResolver;
}

interface SelectionBody {
  provider: AiProviderId;
  mode: AiExecutionMode;
}

interface ProviderParams extends ProjectParams {
  providerId: AiProviderId;
}

interface ConsentBody {
  granted: boolean;
}

const providerStatusSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'label',
    'kind',
    'available',
    'models',
    'message',
    'consentRequired',
    'consentGranted',
  ],
  properties: {
    id: { type: 'string', enum: ['ollama', 'openai'] },
    label: { type: 'string' },
    kind: { type: 'string', enum: ['local', 'cloud'] },
    available: { type: 'boolean' },
    baseUrl: { type: 'string' },
    message: { type: 'string' },
    consentRequired: { type: 'boolean' },
    consentGranted: { type: 'boolean' },
    models: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'capabilities'],
        properties: {
          name: { type: 'string' },
          capabilities: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['chat', 'tools', 'fill-in-the-middle'],
            },
          },
        },
      },
    },
  },
} as const;

const providersStatusSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['selectedProvider', 'selectedMode', 'providers'],
  properties: {
    selectedProvider: { type: 'string', enum: ['ollama', 'openai'] },
    selectedMode: { type: 'string', enum: ['fast', 'complete'] },
    providers: { type: 'array', items: providerStatusSchema },
  },
} as const;

const selectionBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['provider', 'mode'],
  properties: {
    provider: { type: 'string', enum: ['ollama', 'openai'] },
    mode: { type: 'string', enum: ['fast', 'complete'] },
  },
} as const;

const providerParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId', 'providerId'],
  properties: {
    projectId: projectParamsSchema.properties.projectId,
    providerId: { type: 'string', enum: ['ollama', 'openai'] },
  },
} as const;

const consentBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['granted'],
  properties: { granted: { type: 'boolean' } },
} as const;

function translateProviderError(error: unknown): never {
  if (error instanceof AiProviderResolutionError) {
    throw new ApiError({
      statusCode:
        error.code === 'AI_CLOUD_CONSENT_REQUIRED' ? 409 : 400,
      code: 'AI_ASSISTANT_INVALID_REQUEST',
      message: error.message,
    });
  }
  throw error;
}

export const aiProviderRoutes: FastifyPluginAsync<AiProviderRouteOptions> = async (
  app,
  options,
) => {
  function projectFor(projectId: string) {
    const project = options.projectStore.findProject(projectId);
    if (!project) {
      throw new ApiError({
        statusCode: 404,
        code: 'PROJECT_NOT_FOUND',
        message: 'Projeto não encontrado.',
      });
    }
    return project;
  }

  app.get<{ Params: ProjectParams }>(
    '/projects/:projectId/ai/providers',
    {
      schema: {
        params: projectParamsSchema,
        response: { 200: providersStatusSchema, ...commonErrorResponseSchemas },
      },
    },
    async (request) => {
      projectFor(request.params.projectId);
      return options.aiProviderResolver.status(request.params.projectId);
    },
  );

  app.put<{ Params: ProjectParams; Body: SelectionBody }>(
    '/projects/:projectId/ai/selection',
    {
      schema: {
        params: projectParamsSchema,
        body: selectionBodySchema,
        response: { 200: providersStatusSchema, ...commonErrorResponseSchemas },
      },
    },
    async (request) => {
      projectFor(request.params.projectId);
      await options.aiProviderResolver.setSelection(
        request.params.projectId,
        request.body.provider,
        request.body.mode,
      );
      return options.aiProviderResolver.status(request.params.projectId);
    },
  );

  app.put<{ Params: ProviderParams; Body: ConsentBody }>(
    '/projects/:projectId/ai/providers/:providerId/consent',
    {
      schema: {
        params: providerParamsSchema,
        body: consentBodySchema,
        response: { 200: providersStatusSchema, ...commonErrorResponseSchemas },
      },
    },
    async (request) => {
      projectFor(request.params.projectId);
      try {
        await options.aiProviderResolver.setCloudConsent(
          request.params.projectId,
          request.params.providerId,
          request.body.granted,
        );
      } catch (error) {
        translateProviderError(error);
      }
      return options.aiProviderResolver.status(request.params.projectId);
    },
  );
};
