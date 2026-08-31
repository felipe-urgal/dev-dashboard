import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';

import { ApiError } from '../http/api-error.js';
import {
  commonErrorResponseSchemas,
  deploymentConfirmationResponseSchema,
  deploymentHistoryResponseSchema,
  deploymentLogResponseSchema,
  deploymentPlanResponseSchema,
  deploymentResponseSchema,
} from '../http/response-schemas.js';
import {
  DeploymentError,
  type DeploymentErrorCode,
} from '../deployment/errors.js';
import type { DeploymentService } from '../deployment/service.js';
import type { ProjectStore } from '../store/project-store.js';

interface ProjectParams {
  projectId: string;
}

interface DeploymentParams extends ProjectParams {
  deploymentId: string;
}

interface PlanBody {
  planHash: string;
}

interface StartBody extends PlanBody {
  confirmationToken?: string;
}

interface HistoryQuery {
  page?: number;
  pageSize?: number;
}

interface Options extends FastifyPluginOptions {
  projectStore: ProjectStore;
  deploymentService: DeploymentService;
}

const projectParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId'],
  properties: { projectId: { type: 'string', minLength: 1 } },
} as const;

const deploymentParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId', 'deploymentId'],
  properties: {
    projectId: { type: 'string', minLength: 1 },
    deploymentId: { type: 'string', minLength: 1 },
  },
} as const;

const planHashSchema = {
  type: 'string',
  pattern: '^[0-9a-f]{64}$',
} as const;

const confirmationTokenSchema = {
  type: 'string',
  pattern: '^[0-9a-f]{64}$',
} as const;

const statusByCode: Partial<Record<DeploymentErrorCode, number>> = {
  DEPLOYMENT_NOT_FOUND: 404,
  DEPLOYMENT_PRODUCTION_UNAVAILABLE: 409,
  DEPLOYMENT_STRATEGY_UNSUPPORTED: 409,
  DEPLOYMENT_BRANCH_MISMATCH: 409,
  DEPLOYMENT_REVISION_UNAVAILABLE: 409,
  DEPLOYMENT_PLAN_STALE: 409,
  DEPLOYMENT_CONFIRMATION_REQUIRED: 409,
  DEPLOYMENT_ALREADY_RUNNING: 409,
  DEPLOYMENT_BACKUP_REQUIRED: 409,
  DEPLOYMENT_MIGRATION_COMMAND_REQUIRED: 409,
  DEPLOYMENT_PACKAGE_MANAGER_UNSUPPORTED: 409,
  DEPLOYMENT_CANCEL_NOT_AVAILABLE: 409,
};

function translate(error: unknown): never {
  if (!(error instanceof DeploymentError)) throw error;
  throw new ApiError({
    statusCode: statusByCode[error.code] ?? 500,
    code: error.code,
    message: error.message,
  });
}

function findProject(options: Options, projectId: string) {
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

export const deploymentRoutes: FastifyPluginAsync<Options> = async (
  app,
  options,
) => {
  app.post<{ Params: ProjectParams }>(
    '/projects/:projectId/deployments/plan',
    {
      schema: {
        params: projectParamsSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['plan'],
            properties: { plan: deploymentPlanResponseSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = findProject(options, request.params.projectId);
      try {
        return { plan: await options.deploymentService.plan(project) };
      } catch (error) {
        translate(error);
      }
    },
  );

  app.post<{ Params: ProjectParams; Body: PlanBody }>(
    '/projects/:projectId/deployments/confirmations',
    {
      schema: {
        params: projectParamsSchema,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['planHash'],
          properties: { planHash: planHashSchema },
        },
        response: {
          201: {
            type: 'object',
            additionalProperties: false,
            required: ['confirmation'],
            properties: {
              confirmation: deploymentConfirmationResponseSchema,
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      const project = findProject(options, request.params.projectId);
      try {
        return reply.code(201).send({
          confirmation: await options.deploymentService.prepareConfirmation(
            project,
            request.body.planHash,
          ),
        });
      } catch (error) {
        translate(error);
      }
    },
  );

  app.post<{ Params: ProjectParams; Body: StartBody }>(
    '/projects/:projectId/deployments',
    {
      schema: {
        params: projectParamsSchema,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['planHash'],
          properties: {
            planHash: planHashSchema,
            confirmationToken: confirmationTokenSchema,
          },
        },
        response: {
          202: {
            type: 'object',
            additionalProperties: false,
            required: ['deployment'],
            properties: { deployment: deploymentResponseSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      const project = findProject(options, request.params.projectId);
      try {
        return reply.code(202).send({
          deployment: await options.deploymentService.start(
            project,
            request.body.planHash,
            request.body.confirmationToken,
          ),
        });
      } catch (error) {
        translate(error);
      }
    },
  );

  app.get<{ Params: ProjectParams; Querystring: HistoryQuery }>(
    '/projects/:projectId/deployments',
    {
      schema: {
        params: projectParamsSchema,
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            page: { type: 'integer', minimum: 1, default: 1 },
            pageSize: {
              type: 'integer',
              minimum: 1,
              maximum: 100,
              default: 20,
            },
          },
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['history'],
            properties: { history: deploymentHistoryResponseSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      findProject(options, request.params.projectId);
      return {
        history: await options.deploymentService.history(
          request.params.projectId,
          request.query.page,
          request.query.pageSize,
        ),
      };
    },
  );

  app.get<{ Params: DeploymentParams }>(
    '/projects/:projectId/deployments/:deploymentId',
    {
      schema: {
        params: deploymentParamsSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['deployment'],
            properties: { deployment: deploymentResponseSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      findProject(options, request.params.projectId);
      try {
        return {
          deployment: await options.deploymentService.get(
            request.params.projectId,
            request.params.deploymentId,
          ),
        };
      } catch (error) {
        translate(error);
      }
    },
  );

  app.get<{ Params: DeploymentParams }>(
    '/projects/:projectId/deployments/:deploymentId/log',
    {
      schema: {
        params: deploymentParamsSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['log'],
            properties: { log: deploymentLogResponseSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      findProject(options, request.params.projectId);
      try {
        return {
          log: await options.deploymentService.log(
            request.params.projectId,
            request.params.deploymentId,
          ),
        };
      } catch (error) {
        translate(error);
      }
    },
  );

  app.post<{ Params: DeploymentParams }>(
    '/projects/:projectId/deployments/:deploymentId/cancel',
    {
      schema: {
        params: deploymentParamsSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['deployment'],
            properties: { deployment: deploymentResponseSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      findProject(options, request.params.projectId);
      try {
        return {
          deployment: await options.deploymentService.cancel(
            request.params.projectId,
            request.params.deploymentId,
          ),
        };
      } catch (error) {
        translate(error);
      }
    },
  );
};
