import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';

import { ApiError } from '../http/api-error.js';
import {
  commonErrorResponseSchemas,
  projectEnvironmentOverviewResponseSchema,
  projectEnvironmentVariableValueResponseSchema,
} from '../http/response-schemas.js';
import type { ProjectEnvironmentService } from '../services/project-environment-service.js';
import type { ProjectStore } from '../store/project-store.js';

interface Options extends FastifyPluginOptions {
  projectStore: ProjectStore;
  projectEnvironmentService: ProjectEnvironmentService;
}

interface Params {
  projectId: string;
}

interface ValueQuerystring {
  file: string;
  name: string;
}

const paramsSchema = {
  type: 'object', additionalProperties: false, required: ['projectId'],
  properties: { projectId: { type: 'string', minLength: 1 } },
} as const;

const valueQuerystringSchema = {
  type: 'object', additionalProperties: false, required: ['file', 'name'],
  properties: {
    file: {
      type: 'string',
      enum: ['.env', '.env.local', '.env.development', '.env.test', '.env.production'],
    },
    name: {
      type: 'string',
      minLength: 1,
      maxLength: 256,
      pattern: '^[A-Za-z_][A-Za-z0-9_]*$',
    },
  },
} as const;

function requireProject(store: ProjectStore, id: string) {
  const project = store.findProject(id);
  if (!project) throw new ApiError({ statusCode: 404, code: 'PROJECT_NOT_FOUND', message: 'Projeto não encontrado.' });
  return project;
}

export const projectEnvironmentRoutes: FastifyPluginAsync<Options> = async (app, options) => {
  app.get<{ Params: Params }>('/projects/:projectId/environment-variables', {
    schema: {
      params: paramsSchema,
      response: {
        200: {
          type: 'object', additionalProperties: false, required: ['environment'],
          properties: { environment: projectEnvironmentOverviewResponseSchema },
        },
        ...commonErrorResponseSchemas,
      },
    },
  }, async (request) => ({
    environment: await options.projectEnvironmentService.getOverview(
      requireProject(options.projectStore, request.params.projectId),
    ),
  }));

  app.get<{ Params: Params; Querystring: ValueQuerystring }>(
    '/projects/:projectId/environment-variables/value',
    {
      schema: {
        params: paramsSchema,
        querystring: valueQuerystringSchema,
        response: {
          200: {
            type: 'object', additionalProperties: false, required: ['variable'],
            properties: { variable: projectEnvironmentVariableValueResponseSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = requireProject(options.projectStore, request.params.projectId);
      const variable = await options.projectEnvironmentService.getVariableValue(
        project,
        request.query.file,
        request.query.name,
      );

      if (!variable) {
        throw new ApiError({
          statusCode: 404,
          code: 'ENVIRONMENT_VARIABLE_NOT_FOUND',
          message: 'Variável de ambiente não encontrada.',
        });
      }

      return { variable };
    },
  );
};
