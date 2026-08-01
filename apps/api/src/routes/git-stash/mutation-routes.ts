import type { FastifyInstance } from 'fastify';

import type {
  GitStashCreateInput,
  GitStashOperation,
} from '@dev-dashboard/contracts';

import { commonErrorResponseSchemas } from '../../http/response-schemas.js';
import type { GitStashService } from '../../services/git-stash-service.js';
import {
  confirmationBodySchema,
  confirmationSchema,
  createBodySchema,
  mutationBodySchema,
  mutationResultSchema,
  projectFor,
  projectParamsSchema,
  stashParamsSchema,
  translateStashError,
  type GitStashRouteOptions,
  type ProjectParams,
  type StashParams,
} from './helpers.js';

export function registerStashMutationRoutes(
  app: FastifyInstance,
  options: GitStashRouteOptions,
  service: GitStashService,
): void {
  app.post<{
    Params: ProjectParams;
    Body: { operation: GitStashOperation; target: string };
  }>(
    '/projects/:projectId/git/stashes/confirmations',
    {
      schema: {
        params: projectParamsSchema,
        body: confirmationBodySchema,
        response: {
          201: {
            type: 'object',
            additionalProperties: false,
            required: ['confirmation'],
            properties: { confirmation: confirmationSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      const project = projectFor(options, request.params.projectId);
      try {
        return reply.code(201).send({
          confirmation: service.prepareConfirmation(
            project.id,
            request.body.operation,
            request.body.target,
          ),
        });
      } catch (error) {
        translateStashError(error);
      }
    },
  );

  app.post<{
    Params: ProjectParams;
    Body: GitStashCreateInput & { confirmationToken: string };
  }>(
    '/projects/:projectId/git/stashes',
    {
      schema: {
        params: projectParamsSchema,
        body: createBodySchema,
        response: {
          201: {
            type: 'object',
            additionalProperties: false,
            required: ['result'],
            properties: { result: mutationResultSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      const project = projectFor(options, request.params.projectId);
      try {
        return reply.code(201).send({
          result: await service.create(
            project.path,
            project.id,
            {
              message: request.body.message,
              includeUntracked: request.body.includeUntracked,
              keepIndex: request.body.keepIndex,
            },
            request.body.confirmationToken,
          ),
        });
      } catch (error) {
        translateStashError(error);
      }
    },
  );

  for (const operation of ['apply', 'pop', 'drop'] as const) {
    app.post<{
      Params: StashParams;
      Body: { confirmationToken: string };
    }>(
      `/projects/:projectId/git/stashes/:stashReference/${operation}`,
      {
        schema: {
          params: stashParamsSchema,
          body: mutationBodySchema,
          response: {
            200: {
              type: 'object',
              additionalProperties: false,
              required: ['result'],
              properties: { result: mutationResultSchema },
            },
            ...commonErrorResponseSchemas,
          },
        },
      },
      async (request) => {
        const project = projectFor(options, request.params.projectId);
        try {
          return {
            result: await service[operation](
              project.path,
              project.id,
              request.params.stashReference,
              request.body.confirmationToken,
            ),
          };
        } catch (error) {
          translateStashError(error);
        }
      },
    );
  }
}
