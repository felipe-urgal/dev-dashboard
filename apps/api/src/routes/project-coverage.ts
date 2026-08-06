import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';

import {
  commonErrorResponseSchemas,
  projectCoverageSummaryResponseSchema,
} from '../http/response-schemas.js';
import { ApiError } from '../http/api-error.js';
import type { ProjectCoverageService } from '../services/project-coverage-service.js';
import type { ProjectStore } from '../store/project-store.js';

interface Options extends FastifyPluginOptions {
  projectStore: ProjectStore;
  projectCoverageService: ProjectCoverageService;
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

const emptyQuerystringSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {},
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

export const projectCoverageRoutes: FastifyPluginAsync<Options> = async (
  app,
  options,
) => {
  app.get<{ Params: Params }>(
    '/projects/:projectId/coverage',
    {
      schema: {
        params: paramsSchema,
        querystring: emptyQuerystringSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['coverage'],
            properties: {
              coverage: projectCoverageSummaryResponseSchema,
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
      return {
        coverage: await options.projectCoverageService.getSummary(
          project.path,
          project.type,
        ),
      };
    },
  );
};
