import type { FastifyPluginAsync } from 'fastify';

import type {
  ProjectFileWatchRequest,
  ProjectWorkspaceEditApplyRequest,
  ProjectWorkspaceEditRequest,
} from '@dev-dashboard/contracts';

import { ApiError } from '../http/api-error.js';
import { commonErrorResponseSchemas } from '../http/response-schemas.js';
import { ProjectFileError } from '../services/project-file-service.js';
import {
  ProjectWorkspaceEditError,
  type ProjectWorkspaceEditService,
} from '../services/project-workspace-edit-service.js';
import type { ProjectStore } from '../store/project-store.js';
import {
  projectParamsSchema,
  type ProjectParams,
} from './projects/helpers.js';

interface ProjectWorkspaceEditRouteOptions {
  projectStore: ProjectStore;
  projectWorkspaceEditService: ProjectWorkspaceEditService;
}

const versionSchema = {
  type: 'string',
  pattern: '^[a-f0-9]{64}$',
} as const;

const fileContentSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'path',
    'name',
    'language',
    'content',
    'version',
    'size',
    'modifiedAt',
    'writable',
  ],
  properties: {
    path: { type: 'string' },
    name: { type: 'string' },
    language: { type: 'string' },
    content: { type: 'string' },
    version: { type: 'string' },
    size: { type: 'integer', minimum: 0 },
    modifiedAt: { type: 'string' },
    writable: { type: 'boolean' },
  },
} as const;

const positionSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['line', 'column'],
  properties: {
    line: { type: 'integer', minimum: 1 },
    column: { type: 'integer', minimum: 1 },
  },
} as const;

const workspaceTextEditSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['range', 'newText'],
  properties: {
    range: {
      type: 'object',
      additionalProperties: false,
      required: ['start', 'end'],
      properties: {
        start: positionSchema,
        end: positionSchema,
      },
    },
    newText: { type: 'string', maxLength: 524_288 },
  },
} as const;

function translateError(error: unknown): never {
  if (error instanceof ProjectWorkspaceEditError) {
    const statusByCode: Record<ProjectWorkspaceEditError['code'], number> = {
      WORKSPACE_EDIT_INVALID: 400,
      WORKSPACE_EDIT_LIMIT_EXCEEDED: 413,
      WORKSPACE_EDIT_CHANGED_EXTERNALLY: 409,
      WORKSPACE_EDIT_CONFIRMATION_REQUIRED: 409,
      WORKSPACE_EDIT_ROLLBACK_FAILED: 500,
    };
    throw new ApiError({
      statusCode: statusByCode[error.code],
      code: error.code,
      message: error.message,
    });
  }

  if (error instanceof ProjectFileError) {
    const statusByCode: Record<ProjectFileError['code'], number> = {
      FILE_PATH_INVALID: 400,
      FILE_OUTSIDE_PROJECT: 403,
      FILE_NOT_FOUND: 404,
      FILE_IGNORED: 404,
      FILE_NOT_DIRECTORY: 409,
      FILE_NOT_FILE: 409,
      FILE_TOO_LARGE: 413,
      FILE_BINARY: 415,
      FILE_NOT_READABLE: 500,
      FILE_NOT_WRITABLE: 403,
      FILE_VERSION_INVALID: 400,
      FILE_CHANGED_EXTERNALLY: 409,
      FILE_WRITE_FAILED: 500,
      FILE_SEARCH_INVALID: 400,
    };
    throw new ApiError({
      statusCode: statusByCode[error.code],
      code: error.code,
      message: error.message,
    });
  }

  throw error;
}

export const projectWorkspaceEditRoutes: FastifyPluginAsync<
  ProjectWorkspaceEditRouteOptions
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

  app.post<{ Params: ProjectParams; Body: ProjectFileWatchRequest }>(
    '/projects/:projectId/files/watch',
    {
      schema: {
        params: projectParamsSchema,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['files'],
          properties: {
            files: {
              type: 'array',
              maxItems: 20,
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['path', 'version'],
                properties: {
                  path: { type: 'string', minLength: 1, maxLength: 2_048 },
                  version: versionSchema,
                },
              },
            },
          },
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['checkedAt', 'items'],
            properties: {
              checkedAt: { type: 'string' },
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['path', 'state'],
                  properties: {
                    path: { type: 'string' },
                    state: {
                      type: 'string',
                      enum: ['unchanged', 'changed', 'deleted', 'unavailable'],
                    },
                    file: fileContentSchema,
                  },
                },
              },
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = projectFor(request.params.projectId);
      try {
        return await options.projectWorkspaceEditService.watchOpenFiles(
          project.path,
          request.body.files,
        );
      } catch (error) {
        translateError(error);
      }
    },
  );

  app.post<{ Params: ProjectParams; Body: ProjectWorkspaceEditRequest }>(
    '/projects/:projectId/files/workspace-edits/preview',
    {
      schema: {
        params: projectParamsSchema,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['files'],
          properties: {
            files: {
              type: 'array',
              minItems: 1,
              maxItems: 20,
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['path', 'expectedVersion', 'edits'],
                properties: {
                  path: { type: 'string', minLength: 1, maxLength: 2_048 },
                  expectedVersion: versionSchema,
                  edits: {
                    type: 'array',
                    minItems: 1,
                    maxItems: 200,
                    items: workspaceTextEditSchema,
                  },
                },
              },
            },
          },
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['confirmationToken', 'files', 'expiresAt'],
            properties: {
              confirmationToken: { type: 'string' },
              expiresAt: { type: 'string' },
              files: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: [
                    'path',
                    'language',
                    'beforeVersion',
                    'beforeContent',
                    'afterContent',
                  ],
                  properties: {
                    path: { type: 'string' },
                    language: { type: 'string' },
                    beforeVersion: { type: 'string' },
                    beforeContent: { type: 'string' },
                    afterContent: { type: 'string' },
                  },
                },
              },
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = projectFor(request.params.projectId);
      try {
        return await options.projectWorkspaceEditService.previewWorkspaceEdit(
          project.path,
          project.id,
          request.body,
        );
      } catch (error) {
        translateError(error);
      }
    },
  );

  app.post<{ Params: ProjectParams; Body: ProjectWorkspaceEditApplyRequest }>(
    '/projects/:projectId/files/workspace-edits/apply',
    {
      schema: {
        params: projectParamsSchema,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['confirmationToken'],
          properties: {
            confirmationToken: { type: 'string', minLength: 64, maxLength: 64 },
          },
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['files'],
            properties: {
              files: { type: 'array', items: fileContentSchema },
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = projectFor(request.params.projectId);
      try {
        return await options.projectWorkspaceEditService.applyWorkspaceEdit(
          project.path,
          project.id,
          request.body.confirmationToken,
        );
      } catch (error) {
        translateError(error);
      }
    },
  );
};
