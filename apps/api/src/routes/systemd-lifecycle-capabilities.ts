import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';

import { ApiError } from '../http/api-error.js';
import { commonErrorResponseSchemas } from '../http/response-schemas.js';
import type { SystemdLifecycleCapabilitiesService } from '../services/systemd-lifecycle-capabilities-service.js';

interface Options extends FastifyPluginOptions {
  capabilities: Pick<SystemdLifecycleCapabilitiesService, 'inspect'>;
}
interface Params {
  projectId: string;
}
interface Query {
  environmentInstanceId?: string;
}

const actionSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'reason'],
  properties: {
    status: {
      type: 'string',
      enum: ['supported', 'permission-required', 'unsupported', 'unknown'],
    },
    reason: { type: 'string' },
  },
} as const;
const responseSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'projectId',
    'environmentInstanceId',
    'readAt',
    'partial',
    'services',
  ],
  properties: {
    projectId: { type: 'string' },
    environmentInstanceId: { type: 'string' },
    readAt: { type: 'string' },
    partial: { type: 'boolean' },
    services: {
      type: 'array',
      maxItems: 60,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'bindingId',
          'serviceRef',
          'scope',
          'state',
          'readiness',
          'start',
          'stop',
          'restart',
          'executable',
        ],
        properties: {
          bindingId: { type: 'string' },
          serviceRef: { type: 'string' },
          scope: { type: 'string', enum: ['user', 'system', 'unknown'] },
          state: {
            type: 'string',
            enum: [
              'running',
              'starting',
              'stopping',
              'stopped',
              'failed',
              'unknown',
            ],
          },
          readiness: { type: 'string', enum: ['unknown'] },
          observedAt: { type: 'string' },
          start: actionSchema,
          stop: actionSchema,
          restart: actionSchema,
          executable: { type: 'boolean', enum: [false] },
        },
      },
    },
  },
} as const;

export const systemdLifecycleCapabilitiesRoutes: FastifyPluginAsync<
  Options
> = async (app, options) => {
  app.get<{ Params: Params; Querystring: Query }>(
    '/projects/:projectId/systemd-capabilities',
    {
      schema: {
        params: {
          type: 'object',
          additionalProperties: false,
          required: ['projectId'],
          properties: {
            projectId: { type: 'string', minLength: 1, maxLength: 160 },
          },
        },
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            environmentInstanceId: {
              type: 'string',
              minLength: 1,
              maxLength: 512,
            },
          },
        },
        response: { 200: responseSchema, ...commonErrorResponseSchemas },
      },
    },
    async (request) => {
      const rawQuery = request.raw.url?.split('?', 2)[1] ?? '';
      const entries = new URLSearchParams(rawQuery);
      if (
        [...entries.keys()].some((key) => key !== 'environmentInstanceId') ||
        entries.getAll('environmentInstanceId').length > 1
      ) {
        throw new ApiError({
          statusCode: 400,
          code: 'BAD_REQUEST',
          message: 'Unsupported or repeated capabilities query parameter.',
        });
      }
      return options.capabilities.inspect(
        request.params.projectId,
        request.query.environmentInstanceId,
      );
    },
  );
};
