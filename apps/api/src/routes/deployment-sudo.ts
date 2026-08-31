import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';

import { DeploymentError } from '../deployment/errors.js';
import { SudoSessionService } from '../deployment/sudo-session.js';
import { ApiError } from '../http/api-error.js';
import { commonErrorResponseSchemas } from '../http/response-schemas.js';
import type { ProjectStore } from '../store/project-store.js';

interface ProjectParams {
  projectId: string;
}

interface AuthorizeBody {
  password: string;
}

interface Options extends FastifyPluginOptions {
  projectStore: ProjectStore;
  sudoSessionService?: SudoSessionService;
}

const projectParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId'],
  properties: { projectId: { type: 'string', minLength: 1 } },
} as const;

const sudoStatusResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['available', 'authorized'],
  properties: {
    available: { type: 'boolean' },
    authorized: { type: 'boolean' },
  },
} as const;

function assertLoopback(address: string): void {
  if (
    address === '127.0.0.1' ||
    address === '::1' ||
    address === '::ffff:127.0.0.1'
  ) {
    return;
  }
  throw new ApiError({
    statusCode: 403,
    code: 'FORBIDDEN',
    message:
      'A autorização de sudo só pode ser feita acessando o dashboard diretamente pelo host local.',
  });
}

function assertCommandProduction(options: Options, projectId: string): void {
  const project = options.projectStore.findProject(projectId);
  if (!project) {
    throw new ApiError({
      statusCode: 404,
      code: 'PROJECT_NOT_FOUND',
      message: 'Projeto não encontrado.',
    });
  }
  if (
    !project.capabilities.includes('production') ||
    !project.production?.enabled ||
    project.production.strategy !== 'command'
  ) {
    throw new ApiError({
      statusCode: 409,
      code: 'DEPLOYMENT_PRODUCTION_UNAVAILABLE',
      message:
        'A autorização de sudo está disponível somente para projetos de produção command.',
    });
  }
}

function translate(error: unknown): never {
  if (!(error instanceof DeploymentError)) throw error;
  throw new ApiError({
    statusCode: 409,
    code: error.code,
    message: error.message,
  });
}

export const deploymentSudoRoutes: FastifyPluginAsync<Options> = async (
  app,
  options,
) => {
  const sudoSessionService =
    options.sudoSessionService ?? new SudoSessionService();

  app.get<{ Params: ProjectParams }>(
    '/projects/:projectId/deployments/sudo',
    {
      schema: {
        params: projectParamsSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['sudo'],
            properties: { sudo: sudoStatusResponseSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      assertLoopback(request.ip);
      assertCommandProduction(options, request.params.projectId);
      try {
        return { sudo: await sudoSessionService.status() };
      } catch (error) {
        translate(error);
      }
    },
  );

  app.post<{ Params: ProjectParams; Body: AuthorizeBody }>(
    '/projects/:projectId/deployments/sudo',
    {
      schema: {
        params: projectParamsSchema,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['password'],
          properties: {
            password: { type: 'string', minLength: 1, maxLength: 4096 },
          },
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['sudo'],
            properties: { sudo: sudoStatusResponseSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      assertLoopback(request.ip);
      assertCommandProduction(options, request.params.projectId);
      try {
        return {
          sudo: await sudoSessionService.authorize(request.body.password),
        };
      } catch (error) {
        translate(error);
      }
    },
  );
};
