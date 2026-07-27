import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';

import type { RailsMigrationMutationOperation } from '@dev-dashboard/contracts';

import { ApiError } from '../http/api-error.js';
import {
  commonErrorResponseSchemas,
  railsMigrationMutationConfirmationResponseSchema,
  railsMigrationMutationResultResponseSchema,
  railsMigrationsOverviewResponseSchema,
  railsRoutesOverviewResponseSchema,
} from '../http/response-schemas.js';
import { RailsMutationError, type RailsInspectionService } from '../services/rails-inspection-service.js';
import type { ProjectStore } from '../store/project-store.js';

interface Options extends FastifyPluginOptions {
  projectStore: ProjectStore;
  railsInspectionService: RailsInspectionService;
}

interface Params {
  projectId: string;
}

interface MutationConfirmationBody {
  operation: RailsMigrationMutationOperation;
}

interface MutationBody {
  operation: RailsMigrationMutationOperation;
  confirmationToken: string;
}

const paramsSchema = {
  type: 'object', additionalProperties: false, required: ['projectId'],
  properties: { projectId: { type: 'string', minLength: 1 } },
} as const;

const mutationOperationEnum = ['migrate', 'rollback', 'seed', 'prepare'] as const;

const mutationConfirmationBodySchema = {
  type: 'object', additionalProperties: false, required: ['operation'],
  properties: { operation: { type: 'string', enum: mutationOperationEnum } },
} as const;

const mutationBodySchema = {
  type: 'object', additionalProperties: false, required: ['operation', 'confirmationToken'],
  properties: {
    operation: { type: 'string', enum: mutationOperationEnum },
    confirmationToken: { type: 'string', minLength: 64, maxLength: 64 },
  },
} as const;

function requireProject(store: ProjectStore, id: string) {
  const project = store.findProject(id);
  if (!project) throw new ApiError({ statusCode: 404, code: 'PROJECT_NOT_FOUND', message: 'Projeto não encontrado.' });
  return project;
}

function translateMutationError(error: unknown): never {
  if (error instanceof RailsMutationError) {
    const statuses: Record<string, number> = {
      RAILS_MUTATION_UNSUPPORTED: 409,
      RAILS_MUTATION_CONFIRMATION_REQUIRED: 409,
    };
    throw new ApiError({ statusCode: statuses[error.code] ?? 400, code: error.code, message: error.message });
  }
  throw new ApiError({
    statusCode: 500, code: 'RAILS_MUTATION_FAILED',
    message: error instanceof Error ? error.message : 'Não foi possível concluir a operação Rails.',
  });
}

export const railsRoutes: FastifyPluginAsync<Options> = async (app, options) => {
  app.get<{ Params: Params }>('/projects/:projectId/rails/migrations', {
    schema: {
      params: paramsSchema,
      response: {
        200: {
          type: 'object', additionalProperties: false, required: ['migrations'],
          properties: { migrations: railsMigrationsOverviewResponseSchema },
        },
        ...commonErrorResponseSchemas,
      },
    },
  }, async (request) => ({
    migrations: await options.railsInspectionService.getMigrationsOverview(
      requireProject(options.projectStore, request.params.projectId),
    ),
  }));

  app.get<{ Params: Params }>('/projects/:projectId/rails/routes', {
    schema: {
      params: paramsSchema,
      response: {
        200: {
          type: 'object', additionalProperties: false, required: ['routes'],
          properties: { routes: railsRoutesOverviewResponseSchema },
        },
        ...commonErrorResponseSchemas,
      },
    },
  }, async (request) => ({
    routes: await options.railsInspectionService.getRoutesOverview(
      requireProject(options.projectStore, request.params.projectId),
    ),
  }));

  app.post<{ Params: Params; Body: MutationConfirmationBody }>(
    '/projects/:projectId/rails/migrations/confirmations',
    {
      schema: {
        params: paramsSchema,
        body: mutationConfirmationBodySchema,
        response: {
          201: {
            type: 'object', additionalProperties: false, required: ['confirmation'],
            properties: { confirmation: railsMigrationMutationConfirmationResponseSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      const project = requireProject(options.projectStore, request.params.projectId);
      try {
        return reply.code(201).send({
          confirmation: await options.railsInspectionService.prepareMutationConfirmation(project, request.body.operation),
        });
      } catch (error) {
        translateMutationError(error);
      }
    },
  );

  app.post<{ Params: Params; Body: MutationBody }>(
    '/projects/:projectId/rails/migrations/mutations',
    {
      schema: {
        params: paramsSchema,
        body: mutationBodySchema,
        response: {
          200: {
            type: 'object', additionalProperties: false, required: ['result'],
            properties: { result: railsMigrationMutationResultResponseSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = requireProject(options.projectStore, request.params.projectId);
      try {
        return {
          result: await options.railsInspectionService.runMutation(project, request.body.operation, request.body.confirmationToken),
        };
      } catch (error) {
        translateMutationError(error);
      }
    },
  );
};
