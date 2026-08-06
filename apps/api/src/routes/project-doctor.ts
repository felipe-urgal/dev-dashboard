import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';

import {
  commonErrorResponseSchemas,
  projectDiagnosticReportResponseSchema,
} from '../http/response-schemas.js';
import { ApiError } from '../http/api-error.js';
import type { ProjectDoctorService } from '../services/project-doctor-service.js';
import type { ProjectStore } from '../store/project-store.js';

interface Options extends FastifyPluginOptions {
  projectStore: ProjectStore;
  projectDoctorService: ProjectDoctorService;
}

interface Params {
  projectId: string;
}

interface Querystring {
  refresh?: 'true';
}

const paramsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId'],
  properties: {
    projectId: { type: 'string', minLength: 1 },
  },
} as const;

const querystringSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    refresh: { type: 'string', enum: ['true'] },
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

export const projectDoctorRoutes: FastifyPluginAsync<Options> = async (
  app,
  options,
) => {
  app.get<{
    Params: Params;
    Querystring: Querystring;
  }>(
    '/projects/:projectId/doctor',
    {
      schema: {
        params: paramsSchema,
        querystring: querystringSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['report'],
            properties: {
              report: projectDiagnosticReportResponseSchema,
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => ({
      report: await options.projectDoctorService.getReport(
        requireProject(options.projectStore, request.params.projectId),
        { refresh: request.query.refresh === 'true' },
      ),
    }),
  );
};
