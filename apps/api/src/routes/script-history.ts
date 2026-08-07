import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';

import { ApiError } from '../http/api-error.js';
import { commonErrorResponseSchemas } from '../http/response-schemas.js';
import type { ScriptExecutionService } from '../services/script-execution-service.js';
import type { ProjectStore } from '../store/project-store.js';

interface Params {
  projectId: string;
}

interface Options extends FastifyPluginOptions {
  projectStore: ProjectStore;
  scriptExecutionService: ScriptExecutionService;
}

const paramsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId'],
  properties: {
    projectId: { type: 'string', minLength: 1 },
  },
} as const;

export const scriptHistoryRoutes: FastifyPluginAsync<Options> = async (
  app,
  options,
) => {
  app.delete<{ Params: Params }>(
    '/projects/:projectId/scripts/executions',
    {
      schema: {
        params: paramsSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['cleared'],
            properties: {
              cleared: { type: 'integer', minimum: 0 },
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = options.projectStore.findProject(request.params.projectId);
      if (!project) {
        throw new ApiError({
          statusCode: 404,
          code: 'PROJECT_NOT_FOUND',
          message: 'Projeto não encontrado.',
        });
      }
      return {
        cleared: await options.scriptExecutionService.clearHistory(project.id),
      };
    },
  );
};
