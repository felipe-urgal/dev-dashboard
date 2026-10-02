import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';

import { ApiError } from '../http/api-error.js';
import {
  commonErrorResponseSchemas,
  projectDependencyHealthResponseSchema,
} from '../http/response-schemas.js';
import type { ProjectDependencyHealthService } from '../services/project-dependency-health-service.js';
import type { DevelopmentEnvironmentInstanceStore } from '../store/development-environment-instance-store.js';
import type { ProjectStore } from '../store/project-store.js';

interface Options extends FastifyPluginOptions {
  projectStore: ProjectStore;
  developmentEnvironmentInstanceStore: Pick<
    DevelopmentEnvironmentInstanceStore,
    'resolveForProject'
  >;
  dependencyHealthService: Pick<ProjectDependencyHealthService, 'inspect'>;
}

interface Params {
  projectId: string;
}
interface Query {
  environmentInstanceId?: string;
  refresh?: boolean;
}

const paramsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId'],
  properties: {
    projectId: { type: 'string', minLength: 1 },
  },
} as const;

const querySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    environmentInstanceId: { type: 'string', minLength: 1, maxLength: 512 },
    refresh: { type: 'boolean' },
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

export const dependencyHealthRoutes: FastifyPluginAsync<Options> = async (
  app,
  options,
) => {
  app.get<{ Params: Params; Querystring: Query }>(
    '/projects/:projectId/dependency-health',
    {
      schema: {
        params: paramsSchema,
        querystring: querySchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['health'],
            properties: {
              health: projectDependencyHealthResponseSchema,
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
      const executionContext =
        options.developmentEnvironmentInstanceStore.resolveForProject(
          project.id,
          request.query.environmentInstanceId,
        );
      if (!executionContext) {
        throw new ApiError({
          statusCode: 404,
          code: 'ENVIRONMENT_INSTANCE_NOT_FOUND',
          message: 'Ambiente de desenvolvimento não encontrado para este projeto.',
        });
      }
      return {
        health: await options.dependencyHealthService.inspect(
          { ...project, path: executionContext.cwd },
          { refresh: request.query.refresh === true },
        ),
      };
    },
  );
};
