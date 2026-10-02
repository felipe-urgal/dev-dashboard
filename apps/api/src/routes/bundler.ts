import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';

import { ApiError } from '../http/api-error.js';
import {
  bundlerOverviewResponseSchema,
  commonErrorResponseSchemas,
} from '../http/response-schemas.js';
import type { BundlerInspectionService } from '../services/bundler-inspection-service.js';
import type { DevelopmentEnvironmentInstanceStore } from '../store/development-environment-instance-store.js';
import type { ProjectStore } from '../store/project-store.js';

interface Options extends FastifyPluginOptions {
  projectStore: ProjectStore;
  developmentEnvironmentInstanceStore: Pick<
    DevelopmentEnvironmentInstanceStore,
    'resolveForProject'
  >;
  bundlerInspectionService: BundlerInspectionService;
}

interface Params {
  projectId: string;
}
interface Query {
  environmentInstanceId?: string;
}

const paramsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId'],
  properties: { projectId: { type: 'string', minLength: 1 } },
} as const;

const querySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    environmentInstanceId: { type: 'string', minLength: 1, maxLength: 512 },
  },
} as const;

function requireProject(store: ProjectStore, id: string) {
  const project = store.findProject(id);
  if (!project)
    throw new ApiError({
      statusCode: 404,
      code: 'PROJECT_NOT_FOUND',
      message: 'Projeto não encontrado.',
    });
  return project;
}

export const bundlerRoutes: FastifyPluginAsync<Options> = async (
  app,
  options,
) => {
  app.get<{ Params: Params; Querystring: Query }>(
    '/projects/:projectId/bundler',
    {
      schema: {
        params: paramsSchema,
        querystring: querySchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['bundler'],
            properties: { bundler: bundlerOverviewResponseSchema },
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
          message:
            'Ambiente de desenvolvimento não encontrado para este projeto.',
        });
      }
      return {
        bundler: await options.bundlerInspectionService.getOverview(
          project,
          executionContext,
        ),
      };
    },
  );
};
