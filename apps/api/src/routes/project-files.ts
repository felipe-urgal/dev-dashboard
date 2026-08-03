import type { FastifyPluginAsync } from 'fastify';

import { ApiError, type ApiErrorCode } from '../http/api-error.js';
import { commonErrorResponseSchemas } from '../http/response-schemas.js';
import {
  ProjectFileError,
  type ProjectFileService,
} from '../services/project-file-service.js';
import type { ProjectStore } from '../store/project-store.js';
import {
  projectParamsSchema,
  type ProjectParams,
} from './projects/helpers.js';

interface ProjectFileRouteOptions {
  projectStore: ProjectStore;
  projectFileService: ProjectFileService;
}

interface FilePathQuery {
  path?: string;
}

interface FileSearchQuery {
  query: string;
  limit?: number;
}

interface FileWriteBody {
  path: string;
  content: string;
  expectedVersion: string;
}

const fileEntrySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['path', 'name', 'kind'],
  properties: {
    path: { type: 'string' },
    name: { type: 'string' },
    kind: { type: 'string', enum: ['file', 'directory'] },
    language: { type: 'string' },
    size: { type: 'integer', minimum: 0 },
  },
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

function translateProjectFileError(error: unknown): never {
  if (!(error instanceof ProjectFileError)) throw error;

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
    code: error.code as ApiErrorCode,
    message: error.message,
  });
}

export const projectFileRoutes: FastifyPluginAsync<
  ProjectFileRouteOptions
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

  app.get<{ Params: ProjectParams; Querystring: FilePathQuery }>(
    '/projects/:projectId/files',
    {
      schema: {
        params: projectParamsSchema,
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            path: { type: 'string', maxLength: 2_048 },
          },
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['path', 'entries', 'truncated'],
            properties: {
              path: { type: 'string' },
              entries: { type: 'array', items: fileEntrySchema },
              truncated: { type: 'boolean' },
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = projectFor(request.params.projectId);
      try {
        return await options.projectFileService.listDirectory(
          project.path,
          request.query.path ?? '',
        );
      } catch (error) {
        translateProjectFileError(error);
      }
    },
  );

  app.get<{ Params: ProjectParams; Querystring: FilePathQuery }>(
    '/projects/:projectId/files/content',
    {
      schema: {
        params: projectParamsSchema,
        querystring: {
          type: 'object',
          additionalProperties: false,
          required: ['path'],
          properties: {
            path: { type: 'string', minLength: 1, maxLength: 2_048 },
          },
        },
        response: {
          200: fileContentSchema,
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = projectFor(request.params.projectId);
      try {
        return await options.projectFileService.readFile(
          project.path,
          request.query.path ?? '',
        );
      } catch (error) {
        translateProjectFileError(error);
      }
    },
  );

  app.put<{ Params: ProjectParams; Body: FileWriteBody }>(
    '/projects/:projectId/files/content',
    {
      schema: {
        params: projectParamsSchema,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['path', 'content', 'expectedVersion'],
          properties: {
            path: { type: 'string', minLength: 1, maxLength: 2_048 },
            content: { type: 'string', maxLength: 524_288 },
            expectedVersion: {
              type: 'string',
              pattern: '^[a-f0-9]{64}$',
            },
          },
        },
        response: {
          200: fileContentSchema,
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = projectFor(request.params.projectId);
      try {
        return await options.projectFileService.writeFile(
          project.path,
          request.body.path,
          request.body.content,
          request.body.expectedVersion,
        );
      } catch (error) {
        translateProjectFileError(error);
      }
    },
  );

  app.get<{ Params: ProjectParams; Querystring: FileSearchQuery }>(
    '/projects/:projectId/files/search',
    {
      schema: {
        params: projectParamsSchema,
        querystring: {
          type: 'object',
          additionalProperties: false,
          required: ['query'],
          properties: {
            query: { type: 'string', minLength: 2, maxLength: 100 },
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 100,
              default: 50,
            },
          },
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['query', 'items', 'truncated', 'scannedFiles'],
            properties: {
              query: { type: 'string' },
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: [
                    'path',
                    'name',
                    'language',
                    'line',
                    'column',
                    'preview',
                  ],
                  properties: {
                    path: { type: 'string' },
                    name: { type: 'string' },
                    language: { type: 'string' },
                    line: { type: 'integer', minimum: 1 },
                    column: { type: 'integer', minimum: 1 },
                    preview: { type: 'string' },
                  },
                },
              },
              truncated: { type: 'boolean' },
              scannedFiles: { type: 'integer', minimum: 0 },
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = projectFor(request.params.projectId);
      try {
        return await options.projectFileService.search(
          project.path,
          request.query.query,
          request.query.limit ?? 50,
        );
      } catch (error) {
        translateProjectFileError(error);
      }
    },
  );
};
