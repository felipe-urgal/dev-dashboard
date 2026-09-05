import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';

import type { WorkspaceRepository } from '@dev-dashboard/core';

import { ApiError } from '../http/api-error.js';
import { commonErrorResponseSchemas } from '../http/response-schemas.js';
import type { AttentionCenterService } from '../services/attention-center-service.js';
import type { ProjectStore } from '../store/project-store.js';

interface Options extends FastifyPluginOptions {
  workspaceRepository: WorkspaceRepository;
  projectStore: ProjectStore;
  attentionCenterService: AttentionCenterService;
}

interface Params {
  workspaceId: string;
}

const paramsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['workspaceId'],
  properties: {
    workspaceId: { type: 'string', minLength: 1 },
  },
} as const;

const attentionItemSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'projectId',
    'projectName',
    'category',
    'severity',
    'message',
    'observedAt',
    'action',
  ],
  properties: {
    id: { type: 'string' },
    projectId: { type: 'string' },
    projectName: { type: 'string' },
    category: {
      type: 'string',
      enum: ['git', 'process', 'test', 'production', 'doctor'],
    },
    severity: { type: 'string', enum: ['critical', 'warning'] },
    message: { type: 'string' },
    observedAt: { type: 'string' },
    action: {
      type: 'object',
      additionalProperties: false,
      required: ['destination'],
      properties: {
        destination: {
          type: 'string',
          enum: ['processes', 'git', 'tests', 'production', 'doctor'],
        },
        projectId: { type: 'string' },
      },
    },
  },
} as const;

const unavailableSourceSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['category'],
  properties: {
    category: {
      type: 'string',
      enum: ['git', 'process', 'test', 'production', 'doctor'],
    },
    projectId: { type: 'string' },
  },
} as const;

const workspaceAttentionSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'workspaceId',
    'generatedAt',
    'partial',
    'unavailableSources',
    'items',
  ],
  properties: {
    workspaceId: { type: 'string' },
    generatedAt: { type: 'string' },
    partial: { type: 'boolean' },
    unavailableSources: {
      type: 'array',
      items: unavailableSourceSchema,
    },
    items: { type: 'array', items: attentionItemSchema },
  },
} as const;

export const attentionRoutes: FastifyPluginAsync<Options> = async (
  app,
  options,
) => {
  app.get<{ Params: Params }>(
    '/workspaces/:workspaceId/attention',
    {
      schema: {
        params: paramsSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['attention'],
            properties: { attention: workspaceAttentionSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const workspace = await options.workspaceRepository.find(
        request.params.workspaceId,
      );
      if (!workspace) {
        throw new ApiError({
          statusCode: 404,
          code: 'WORKSPACE_NOT_FOUND',
          message: 'Workspace não encontrado.',
        });
      }

      const scan = options.projectStore
        .listWorkspaceScans()
        .find((entry) => entry.workspaceId === workspace.id);

      return {
        attention: await options.attentionCenterService.read(
          workspace.id,
          scan?.projects ?? [],
        ),
      };
    },
  );
};
