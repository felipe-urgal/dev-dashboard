import type { FastifyPluginAsync } from 'fastify';

import type {
  ProjectFileCreateRequest,
  ProjectFileMutationApplyRequest,
  ProjectFileMutationPreviewRequest,
} from '@dev-dashboard/contracts';

import { ApiError, type ApiErrorCode } from '../http/api-error.js';
import { commonErrorResponseSchemas } from '../http/response-schemas.js';
import {
  ProjectFileMutationError,
  type ProjectFileMutationService,
} from '../services/project-file-mutation-service.js';
import type { ProjectStore } from '../store/project-store.js';
import {
  projectParamsSchema,
  type ProjectParams,
} from './projects/helpers.js';

interface ProjectFileMutationRouteOptions {
  projectStore: ProjectStore;
  projectFileMutationService: ProjectFileMutationService;
}

const resultSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['operation', 'path', 'kind'],
  properties: {
    operation: { type: 'string', enum: ['create', 'rename', 'delete'] },
    path: { type: 'string' },
    destinationPath: { type: 'string' },
    kind: { type: 'string', enum: ['file', 'directory'] },
  },
} as const;

const previewSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'confirmationToken',
    'operation',
    'path',
    'kind',
    'affectedFiles',
    'affectedDirectories',
    'totalBytes',
    'requiresPhrase',
    'expiresAt',
  ],
  properties: {
    confirmationToken: { type: 'string' },
    operation: { type: 'string', enum: ['rename', 'delete'] },
    path: { type: 'string' },
    destinationPath: { type: 'string' },
    kind: { type: 'string', enum: ['file', 'directory'] },
    affectedFiles: { type: 'integer', minimum: 0 },
    affectedDirectories: { type: 'integer', minimum: 0 },
    totalBytes: { type: 'integer', minimum: 0 },
    requiresPhrase: { type: 'boolean' },
    confirmationPhrase: { type: 'string' },
    expiresAt: { type: 'string' },
  },
} as const;

function translateMutationError(error: unknown): never {
  if (!(error instanceof ProjectFileMutationError)) throw error;

  const responseByCode: Record<
    ProjectFileMutationError['code'],
    { statusCode: number; code: ApiErrorCode }
  > = {
    FILE_PATH_INVALID: { statusCode: 400, code: 'FILE_PATH_INVALID' },
    FILE_OUTSIDE_PROJECT: { statusCode: 403, code: 'FILE_OUTSIDE_PROJECT' },
    FILE_NOT_FOUND: { statusCode: 404, code: 'FILE_NOT_FOUND' },
    FILE_IGNORED: { statusCode: 404, code: 'FILE_IGNORED' },
    FILE_NOT_DIRECTORY: { statusCode: 409, code: 'FILE_NOT_DIRECTORY' },
    FILE_NOT_FILE: { statusCode: 409, code: 'FILE_NOT_FILE' },
    FILE_NOT_WRITABLE: { statusCode: 403, code: 'FILE_NOT_WRITABLE' },
    FILE_TOO_LARGE: { statusCode: 413, code: 'FILE_TOO_LARGE' },
    FILE_ALREADY_EXISTS: { statusCode: 409, code: 'CONFLICT' },
    FILE_MUTATION_TOO_LARGE: { statusCode: 409, code: 'CONFLICT' },
    FILE_MUTATION_HIDDEN_CONTENT: { statusCode: 403, code: 'FORBIDDEN' },
    FILE_MUTATION_CONFIRMATION_INVALID: { statusCode: 409, code: 'CONFLICT' },
    FILE_CHANGED_EXTERNALLY: {
      statusCode: 409,
      code: 'FILE_CHANGED_EXTERNALLY',
    },
    FILE_WRITE_FAILED: { statusCode: 500, code: 'FILE_WRITE_FAILED' },
  };

  const response = responseByCode[error.code];
  throw new ApiError({
    statusCode: response.statusCode,
    code: response.code,
    message: error.message,
  });
}

export const projectFileMutationRoutes: FastifyPluginAsync<
  ProjectFileMutationRouteOptions
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

  app.post<{ Params: ProjectParams; Body: ProjectFileCreateRequest }>(
    '/projects/:projectId/files/entries',
    {
      schema: {
        params: projectParamsSchema,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['path', 'kind'],
          properties: {
            path: { type: 'string', minLength: 1, maxLength: 2_048 },
            kind: { type: 'string', enum: ['file', 'directory'] },
            content: { type: 'string', maxLength: 524_288 },
          },
        },
        response: {
          201: resultSchema,
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      const project = projectFor(request.params.projectId);
      try {
        const result = await options.projectFileMutationService.createEntry(
          project.path,
          request.body,
        );
        return reply.code(201).send(result);
      } catch (error) {
        translateMutationError(error);
      }
    },
  );

  app.post<{
    Params: ProjectParams;
    Body: ProjectFileMutationPreviewRequest;
  }>(
    '/projects/:projectId/files/mutations/preview',
    {
      schema: {
        params: projectParamsSchema,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['operation', 'path'],
          properties: {
            operation: { type: 'string', enum: ['rename', 'delete'] },
            path: { type: 'string', minLength: 1, maxLength: 2_048 },
            destinationPath: {
              type: 'string',
              minLength: 1,
              maxLength: 2_048,
            },
          },
        },
        response: {
          200: previewSchema,
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = projectFor(request.params.projectId);
      try {
        return await options.projectFileMutationService.previewMutation(
          project.path,
          request.body,
        );
      } catch (error) {
        translateMutationError(error);
      }
    },
  );

  app.post<{
    Params: ProjectParams;
    Body: ProjectFileMutationApplyRequest;
  }>(
    '/projects/:projectId/files/mutations/apply',
    {
      schema: {
        params: projectParamsSchema,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['confirmationToken'],
          properties: {
            confirmationToken: {
              type: 'string',
              minLength: 1,
              maxLength: 100,
            },
            confirmationPhrase: {
              type: 'string',
              maxLength: 2_048,
            },
          },
        },
        response: {
          200: resultSchema,
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = projectFor(request.params.projectId);
      try {
        return await options.projectFileMutationService.applyMutation(
          project.path,
          request.body,
        );
      } catch (error) {
        translateMutationError(error);
      }
    },
  );
};
