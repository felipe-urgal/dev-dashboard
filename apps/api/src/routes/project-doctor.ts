import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';

import {
  commonErrorResponseSchemas,
  projectDiagnosticReportResponseSchema,
} from '../http/response-schemas.js';
import { ApiError } from '../http/api-error.js';
import type { ProjectDoctorService } from '../services/project-doctor-service.js';
import type { ProjectStore } from '../store/project-store.js';
import type { DevelopmentEnvironmentInstanceStore } from '../store/development-environment-instance-store.js';

interface Options extends FastifyPluginOptions {
  projectStore: ProjectStore;
  projectDoctorService: ProjectDoctorService;
  developmentEnvironmentInstanceStore: Pick<
    DevelopmentEnvironmentInstanceStore,
    'resolveForProject' | 'findForProject'
  >;
}

interface Params {
  projectId: string;
}

interface Querystring {
  refresh?: 'true';
  environmentInstanceId?: string;
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
    environmentInstanceId: { type: 'string', minLength: 1, maxLength: 512 },
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
      const instance =
        options.developmentEnvironmentInstanceStore.findForProject(
          project.id,
          executionContext.environmentInstanceId,
        );
      return {
        report: await options.projectDoctorService.getReport(project, {
          refresh: request.query.refresh === 'true',
          executionContext,
          ...(instance ? { contextRevision: instance.lifecycle } : {}),
        }),
      };
    },
  );
};
