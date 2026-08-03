import type { FastifyInstance } from 'fastify';

import {
  commonErrorResponseSchemas,
  railsMigrationMutationConfirmationResponseSchema,
  railsMigrationMutationResultResponseSchema,
} from '../../http/response-schemas.js';
import {
  generatorConfirmationBodySchema,
  generatorMutationBodySchema,
  mutationBodySchema,
  mutationConfirmationBodySchema,
  paramsSchema,
  railsGeneratorConfirmationResponseSchema,
  railsGeneratorResultResponseSchema,
  requireProject,
  translateMutationError,
  type GeneratorConfirmationBody,
  type GeneratorMutationBody,
  type MutationBody,
  type MutationConfirmationBody,
  type Params,
  type RailsRouteOptions,
} from './helpers.js';

export function registerRailsMutationRoutes(
  app: FastifyInstance,
  options: RailsRouteOptions,
): void {
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

  app.post<{ Params: Params; Body: GeneratorConfirmationBody }>(
    '/projects/:projectId/rails/generate/confirmations',
    {
      schema: {
        params: paramsSchema,
        body: generatorConfirmationBodySchema,
        response: {
          201: {
            type: 'object', additionalProperties: false, required: ['confirmation'],
            properties: { confirmation: railsGeneratorConfirmationResponseSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      const project = requireProject(options.projectStore, request.params.projectId);
      try {
        return reply.code(201).send({
          confirmation: await options.railsInspectionService.prepareGeneratorConfirmation(
            project,
            request.body.kind,
            request.body.name,
            request.body.fields,
            request.body.database,
          ),
        });
      } catch (error) {
        translateMutationError(error);
      }
    },
  );

  app.post<{ Params: Params; Body: GeneratorMutationBody }>(
    '/projects/:projectId/rails/generate/mutations',
    {
      schema: {
        params: paramsSchema,
        body: generatorMutationBodySchema,
        response: {
          200: {
            type: 'object', additionalProperties: false, required: ['result'],
            properties: { result: railsGeneratorResultResponseSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = requireProject(options.projectStore, request.params.projectId);
      try {
        return {
          result: await options.railsInspectionService.runGenerator(project, request.body.confirmationToken),
        };
      } catch (error) {
        translateMutationError(error);
      }
    },
  );
}
