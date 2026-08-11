import type { FastifyInstance } from 'fastify';

import { commonErrorResponseSchemas } from '../../http/response-schemas.js';
import {
  generatorConfirmationBodySchema,
  generatorMutationBodySchema,
  paramsSchema,
  railsGeneratorConfirmationResponseSchema,
  railsGeneratorResultResponseSchema,
  requireProject,
  translateMutationError,
  type GeneratorConfirmationBody,
  type GeneratorMutationBody,
  type Params,
  type RailsRouteOptions,
} from './helpers.js';

export function registerRailsMutationRoutes(
  app: FastifyInstance,
  options: RailsRouteOptions,
): void {
  app.post<{ Params: Params; Body: GeneratorConfirmationBody }>(
    '/projects/:projectId/rails/generate/confirmations',
    {
      schema: {
        params: paramsSchema,
        body: generatorConfirmationBodySchema,
        response: {
          201: {
            type: 'object',
            additionalProperties: false,
            required: ['confirmation'],
            properties: {
              confirmation: railsGeneratorConfirmationResponseSchema,
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      const project = requireProject(
        options.projectStore,
        request.params.projectId,
      );
      try {
        return reply.code(201).send({
          confirmation:
            await options.railsInspectionService.prepareGeneratorConfirmation(
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
            type: 'object',
            additionalProperties: false,
            required: ['result'],
            properties: { result: railsGeneratorResultResponseSchema },
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
      try {
        return {
          result: await options.railsInspectionService.runGenerator(
            project,
            request.body.confirmationToken,
          ),
        };
      } catch (error) {
        translateMutationError(error);
      }
    },
  );
}
