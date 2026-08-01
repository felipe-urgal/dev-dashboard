import type { FastifyInstance } from 'fastify';

import { commonErrorResponseSchemas } from '../../http/response-schemas.js';
import type { GitStashService } from '../../services/git-stash-service.js';
import {
  projectFor,
  projectParamsSchema,
  stashDetailSchema,
  stashParamsSchema,
  stashSummarySchema,
  translateStashError,
  type GitStashRouteOptions,
  type ProjectParams,
  type StashParams,
} from './helpers.js';

export function registerStashListDetailRoutes(
  app: FastifyInstance,
  options: GitStashRouteOptions,
  service: GitStashService,
): void {
  app.get<{ Params: ProjectParams }>(
    '/projects/:projectId/git/stashes',
    {
      schema: {
        params: projectParamsSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['stashes'],
            properties: {
              stashes: { type: 'array', items: stashSummarySchema },
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = projectFor(options, request.params.projectId);
      try {
        return { stashes: await service.list(project.path) };
      } catch (error) {
        translateStashError(error);
      }
    },
  );

  app.get<{ Params: StashParams }>(
    '/projects/:projectId/git/stashes/:stashReference',
    {
      schema: {
        params: stashParamsSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['detail'],
            properties: { detail: stashDetailSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = projectFor(options, request.params.projectId);
      try {
        return {
          detail: await service.inspect(
            project.path,
            request.params.stashReference,
          ),
        };
      } catch (error) {
        translateStashError(error);
      }
    },
  );
}
