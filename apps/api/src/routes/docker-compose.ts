import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';
import type { ComposeServiceAction } from '@dev-dashboard/contracts';

import { ProcessManagerError } from '@dev-dashboard/process-manager';

import { ApiError } from '../http/api-error.js';
import {
  commonErrorResponseSchemas,
  composeServiceActionResultSchema,
  composeServiceConfirmationSchema,
  composeServiceLogsSchema,
  managedProcessResponseSchema,
  nullableManagedProcessResponseSchema,
  processLogSnapshotResponseSchema,
  projectComposeOverviewSchema,
} from '../http/response-schemas.js';
import { processManagerApiError, type ProcessLogQuery } from './processes/helpers.js';
import {
  DockerComposeError,
  type DockerComposeService,
} from '../services/docker-compose-service.js';
import type { ProjectStore } from '../store/project-store.js';
import { projectParamsSchema, type ProjectParams } from './projects/helpers.js';

interface DockerComposeRouteOptions extends FastifyPluginOptions {
  projectStore: ProjectStore;
  dockerComposeService: DockerComposeService;
}

interface ServiceParams extends ProjectParams {
  serviceName: string;
}

interface ActionBody {
  serviceName: string;
  action: ComposeServiceAction;
  confirmationToken?: string;
}

interface ConfirmationBody {
  serviceName: string;
  action: 'stop' | 'restart';
}

const serviceNameSchema = { type: 'string', minLength: 1, maxLength: 128 } as const;
const serviceParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId', 'serviceName'],
  properties: {
    projectId: { type: 'string', minLength: 1 },
    serviceName: serviceNameSchema,
  },
} as const;

function translateDockerError(error: unknown): never {
  if (error instanceof DockerComposeError) {
    const statusByCode: Record<DockerComposeError['code'], number> = {
      DOCKER_CONFIG_INVALID: 400,
      DOCKER_NOT_CONFIGURED: 404,
      DOCKER_SERVICE_NOT_FOUND: 404,
      DOCKER_UNAVAILABLE: 409,
      DOCKER_SERVICE_REQUIRES_BUILD: 409,
      DOCKER_CONFIRMATION_REQUIRED: 409,
      DOCKER_ACTION_FAILED: 500,
      DOCKER_BUILD_UNSUPPORTED: 501,
    };
    throw new ApiError({
      statusCode: statusByCode[error.code],
      code: error.code,
      message: error.message,
    });
  }
  throw error;
}

export const dockerComposeRoutes: FastifyPluginAsync<
  DockerComposeRouteOptions
> = async (app, options) => {
  function projectFor(projectId: string) {
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

  app.get<{ Params: ProjectParams }>(
    '/projects/:projectId/docker',
    {
      schema: {
        params: projectParamsSchema,
        response: {
          200: { type: 'object', additionalProperties: false, required: ['docker'], properties: { docker: projectComposeOverviewSchema } },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      try {
        return { docker: await options.dockerComposeService.overview(projectFor(request.params.projectId)) };
      } catch (error) {
        translateDockerError(error);
      }
    },
  );

  app.post<{ Params: ProjectParams; Body: ConfirmationBody }>(
    '/projects/:projectId/docker/confirmations',
    {
      schema: {
        params: projectParamsSchema,
        body: {
          type: 'object', additionalProperties: false, required: ['serviceName', 'action'],
          properties: { serviceName: serviceNameSchema, action: { type: 'string', enum: ['stop', 'restart'] } },
        },
        response: {
          201: { type: 'object', additionalProperties: false, required: ['confirmation'], properties: { confirmation: composeServiceConfirmationSchema } },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      try {
        const confirmation = await options.dockerComposeService.prepareConfirmation(
          projectFor(request.params.projectId), request.body.serviceName, request.body.action,
        );
        return reply.code(201).send({ confirmation });
      } catch (error) {
        translateDockerError(error);
      }
    },
  );

  app.post<{ Params: ProjectParams; Body: ActionBody }>(
    '/projects/:projectId/docker/actions',
    {
      schema: {
        params: projectParamsSchema,
        body: {
          type: 'object', additionalProperties: false, required: ['serviceName', 'action'],
          properties: {
            serviceName: serviceNameSchema,
            action: { type: 'string', enum: ['start', 'stop', 'restart'] },
            confirmationToken: { type: 'string', minLength: 64, maxLength: 64 },
          },
        },
        response: {
          200: { type: 'object', additionalProperties: false, required: ['result'], properties: { result: composeServiceActionResultSchema } },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      try {
        return {
          result: await options.dockerComposeService.runAction(
            projectFor(request.params.projectId),
            request.body.serviceName,
            request.body.action,
            request.body.confirmationToken,
          ),
        };
      } catch (error) {
        translateDockerError(error);
      }
    },
  );

  app.get<{ Params: ServiceParams }>(
    '/projects/:projectId/docker/services/:serviceName/logs',
    {
      schema: {
        params: serviceParamsSchema,
        response: {
          200: { type: 'object', additionalProperties: false, required: ['logs'], properties: { logs: composeServiceLogsSchema } },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      try {
        return {
          logs: await options.dockerComposeService.logs(
            projectFor(request.params.projectId), request.params.serviceName,
          ),
        };
      } catch (error) {
        translateDockerError(error);
      }
    },
  );

  function translateBuildError(error: unknown): never {
    if (error instanceof ProcessManagerError) {
      throw processManagerApiError(error);
    }
    translateDockerError(error);
  }

  app.get<{ Params: ServiceParams }>(
    '/projects/:projectId/docker/services/:serviceName/build',
    {
      schema: {
        params: serviceParamsSchema,
        response: {
          200: { type: 'object', additionalProperties: false, required: ['process'], properties: { process: nullableManagedProcessResponseSchema } },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      try {
        return {
          process: await options.dockerComposeService.getBuildStatus(
            projectFor(request.params.projectId), request.params.serviceName,
          ),
        };
      } catch (error) {
        translateBuildError(error);
      }
    },
  );

  app.post<{ Params: ServiceParams }>(
    '/projects/:projectId/docker/services/:serviceName/build/start',
    {
      schema: {
        params: serviceParamsSchema,
        response: {
          201: { type: 'object', additionalProperties: false, required: ['process'], properties: { process: managedProcessResponseSchema } },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      try {
        const process = await options.dockerComposeService.startBuild(
          projectFor(request.params.projectId), request.params.serviceName,
        );
        return reply.code(201).send({ process });
      } catch (error) {
        translateBuildError(error);
      }
    },
  );

  app.post<{ Params: ServiceParams }>(
    '/projects/:projectId/docker/services/:serviceName/build/stop',
    {
      schema: {
        params: serviceParamsSchema,
        response: {
          200: { type: 'object', additionalProperties: false, required: ['process'], properties: { process: managedProcessResponseSchema } },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      try {
        return {
          process: await options.dockerComposeService.stopBuild(
            projectFor(request.params.projectId), request.params.serviceName,
          ),
        };
      } catch (error) {
        translateBuildError(error);
      }
    },
  );

  app.get<{ Params: ServiceParams; Querystring: ProcessLogQuery }>(
    '/projects/:projectId/docker/services/:serviceName/build/logs',
    {
      schema: {
        params: serviceParamsSchema,
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: { maxBytes: { type: 'integer', minimum: 1, maximum: 262_144 } },
        },
        response: {
          200: { type: 'object', additionalProperties: false, required: ['log'], properties: { log: processLogSnapshotResponseSchema } },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      try {
        return {
          log: await options.dockerComposeService.readBuildLog(
            projectFor(request.params.projectId),
            request.params.serviceName,
            request.query.maxBytes !== undefined ? { maxBytes: request.query.maxBytes } : {},
          ),
        };
      } catch (error) {
        translateBuildError(error);
      }
    },
  );

  app.delete<{ Params: ServiceParams }>(
    '/projects/:projectId/docker/services/:serviceName/build/logs',
    {
      schema: {
        params: serviceParamsSchema,
        response: {
          200: { type: 'object', additionalProperties: false, required: ['log'], properties: { log: processLogSnapshotResponseSchema } },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      try {
        return {
          log: await options.dockerComposeService.clearBuildLog(
            projectFor(request.params.projectId), request.params.serviceName,
          ),
        };
      } catch (error) {
        translateBuildError(error);
      }
    },
  );
};
