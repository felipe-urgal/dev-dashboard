import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';

import type { Project } from '@dev-dashboard/contracts';

import { ApiError } from '../http/api-error.js';
import {
  commonErrorResponseSchemas,
  projectEnvironmentContractResponseSchema,
  projectEnvironmentOverviewResponseSchema,
  projectEnvironmentVariableValueResponseSchema,
} from '../http/response-schemas.js';
import {
  PROJECT_ENVIRONMENT_FILES,
  type ProjectEnvironmentService,
} from '../services/project-environment-service.js';
import type { DevelopmentEnvironmentInstanceStore } from '../store/development-environment-instance-store.js';
import type { ProjectStore } from '../store/project-store.js';

interface Options extends FastifyPluginOptions {
  projectStore: ProjectStore;
  developmentEnvironmentInstanceStore: DevelopmentEnvironmentInstanceStore;
  projectEnvironmentService: ProjectEnvironmentService;
}

interface Params {
  projectId: string;
}

interface EnvironmentQuerystring {
  environmentInstanceId?: string;
}

interface RevealBody {
  file: string;
  name: string;
}

const paramsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId'],
  properties: { projectId: { type: 'string', minLength: 1 } },
} as const;

const environmentQuerystringSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    environmentInstanceId: {
      type: 'string',
      minLength: 1,
      maxLength: 512,
    },
  },
} as const;

const revealBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['file', 'name'],
  properties: {
    file: {
      type: 'string',
      enum: PROJECT_ENVIRONMENT_FILES,
    },
    name: {
      type: 'string',
      minLength: 1,
      maxLength: 256,
      pattern: '^[A-Za-z_][A-Za-z0-9_]*$',
    },
  },
} as const;

function requireProject(store: ProjectStore, id: string): Project {
  const project = store.findProject(id);
  if (!project)
    throw new ApiError({
      statusCode: 404,
      code: 'PROJECT_NOT_FOUND',
      message: 'Projeto não encontrado.',
    });
  return project;
}

function requireScopedProject(
  options: Options,
  projectId: string,
  environmentInstanceId?: string,
): Project {
  const project = requireProject(options.projectStore, projectId);
  const executionContext =
    options.developmentEnvironmentInstanceStore.resolveForProject(
      project.id,
      environmentInstanceId,
    );
  if (!executionContext) {
    throw new ApiError({
      statusCode: 404,
      code: 'ENVIRONMENT_INSTANCE_NOT_FOUND',
      message: 'Ambiente de desenvolvimento não encontrado para este projeto.',
    });
  }
  return { ...project, path: executionContext.cwd };
}

export const projectEnvironmentRoutes: FastifyPluginAsync<Options> = async (
  app,
  options,
) => {
  app.get<{ Params: Params; Querystring: EnvironmentQuerystring }>(
    '/projects/:projectId/environment-variables',
    {
      schema: {
        params: paramsSchema,
        querystring: environmentQuerystringSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['environment'],
            properties: {
              environment: projectEnvironmentOverviewResponseSchema,
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => ({
      environment: await options.projectEnvironmentService.getOverview(
        requireScopedProject(
          options,
          request.params.projectId,
          request.query.environmentInstanceId,
        ),
      ),
    }),
  );

  app.get<{ Params: Params; Querystring: EnvironmentQuerystring }>(
    '/projects/:projectId/environment-contract',
    {
      schema: {
        params: paramsSchema,
        querystring: environmentQuerystringSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['contract'],
            properties: {
              contract: projectEnvironmentContractResponseSchema,
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => ({
      contract: await options.projectEnvironmentService.getContract(
        requireScopedProject(
          options,
          request.params.projectId,
          request.query.environmentInstanceId,
        ),
      ),
    }),
  );

  app.post<{
    Params: Params;
    Querystring: EnvironmentQuerystring;
    Body: RevealBody;
  }>(
    '/projects/:projectId/environment-variables/reveal',
    {
      schema: {
        params: paramsSchema,
        querystring: environmentQuerystringSchema,
        body: revealBodySchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['variable'],
            properties: {
              variable: projectEnvironmentVariableValueResponseSchema,
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      const project = requireScopedProject(
        options,
        request.params.projectId,
        request.query.environmentInstanceId,
      );
      const variable = await options.projectEnvironmentService.getVariableValue(
        project,
        request.body.file,
        request.body.name,
      );

      if (!variable) {
        throw new ApiError({
          statusCode: 404,
          code: 'NOT_FOUND',
          message: 'Variável de ambiente não encontrada.',
        });
      }

      reply.header('Cache-Control', 'private, no-store, max-age=0');
      reply.header('Pragma', 'no-cache');
      return { variable };
    },
  );
};
