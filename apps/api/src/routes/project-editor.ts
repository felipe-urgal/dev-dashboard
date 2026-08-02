import type { FastifyPluginAsync } from 'fastify';
import type { ProjectEditorId } from '@dev-dashboard/contracts';

import { ApiError } from '../http/api-error.js';
import { commonErrorResponseSchemas } from '../http/response-schemas.js';
import {
  ProjectEditorError,
  type ProjectEditorService,
} from '../services/project-editor-service.js';
import type { ProjectStore } from '../store/project-store.js';
import { projectParamsSchema, type ProjectParams } from './projects/helpers.js';

interface ProjectEditorRouteOptions {
  projectStore: ProjectStore;
  projectEditorService: ProjectEditorService;
}

interface OpenEditorBody {
  editorId: ProjectEditorId;
}

const editorIdSchema = {
  type: 'string',
  enum: ['vscode', 'cursor', 'vscodium', 'sublime', 'zed'],
} as const;

const editorSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'name'],
  properties: {
    id: editorIdSchema,
    name: { type: 'string' },
  },
} as const;

function translateEditorError(error: unknown): never {
  if (error instanceof ProjectEditorError) {
    throw new ApiError({
      statusCode: error.code === 'EDITOR_NOT_AVAILABLE' ? 409 : 500,
      code: error.code,
      message: error.message,
    });
  }
  throw error;
}

export const projectEditorRoutes: FastifyPluginAsync<
  ProjectEditorRouteOptions
> = async (app, options) => {
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
    '/projects/:projectId/editors',
    {
      schema: {
        params: projectParamsSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['editors'],
            properties: {
              editors: { type: 'array', items: editorSchema },
              preferredEditorId: editorIdSchema,
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      projectFor(request.params.projectId);
      return options.projectEditorService.availability();
    },
  );

  app.post<{ Params: ProjectParams; Body: OpenEditorBody }>(
    '/projects/:projectId/editor',
    {
      schema: {
        params: projectParamsSchema,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['editorId'],
          properties: { editorId: editorIdSchema },
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['editor', 'opened'],
            properties: {
              editor: editorSchema,
              opened: { type: 'boolean', const: true },
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = projectFor(request.params.projectId);
      try {
        return await options.projectEditorService.open(
          project.path,
          request.body.editorId,
        );
      } catch (error) {
        translateEditorError(error);
      }
    },
  );
};
