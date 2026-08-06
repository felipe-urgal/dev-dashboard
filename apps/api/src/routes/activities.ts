import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';

import type { ActivityOrigin, ActivityStatus } from '@dev-dashboard/contracts';

import {
  activityListResponseSchema,
  commonErrorResponseSchemas,
} from '../http/response-schemas.js';
import type { ActivityService } from '../services/activity-service.js';

interface Query {
  workspaceId?: string;
  projectId?: string;
  origin?: ActivityOrigin;
  status?: ActivityStatus;
  search?: string;
  page?: number;
  pageSize?: number;
}

interface Options extends FastifyPluginOptions {
  activityService: ActivityService;
}

export const activityRoutes: FastifyPluginAsync<Options> = async (
  app,
  options,
) => {
  app.get<{ Querystring: Query }>(
    '/activities',
    {
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            workspaceId: { type: 'string', minLength: 1, maxLength: 200 },
            projectId: { type: 'string', minLength: 1, maxLength: 200 },
            origin: { type: 'string', enum: ['script', 'test', 'server'] },
            status: {
              type: 'string',
              enum: ['running', 'succeeded', 'failed', 'cancelled', 'unknown'],
            },
            search: { type: 'string', maxLength: 200 },
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
            required: ['activities'],
            properties: { activities: activityListResponseSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const activities = await options.activityService.list(request.query);
      return { activities };
    },
  );
};
