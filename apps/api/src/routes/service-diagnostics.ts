import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';
import { ApiError } from '../http/api-error.js';
import { commonErrorResponseSchemas } from '../http/response-schemas.js';
import {
  ServiceDiagnosticsError,
  type ServiceDiagnosticsService,
} from '../services/service-diagnostics-service.js';

interface Options extends FastifyPluginOptions {
  diagnostics: Pick<ServiceDiagnosticsService, 'read'>;
}

interface Params {
  projectId: string;
  serviceRef: string;
}
interface Query {
  environmentInstanceId?: string;
}

const resourceRefSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'id'],
  properties: {
    kind: { type: 'string' },
    id: { type: 'string' },
  },
} as const;
const responseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['diagnostics'],
  properties: {
    diagnostics: {
      type: 'object',
      additionalProperties: false,
      required: [
        'serviceRef',
        'projectId',
        'environmentInstanceId',
        'provider',
        'source',
        'status',
        'state',
        'readiness',
        'readAt',
        'stale',
        'partial',
        'masked',
        'truncated',
        'events',
        'jobs',
      ],
      properties: {
        serviceRef: { type: 'string' },
        projectId: { type: 'string' },
        environmentInstanceId: { type: 'string' },
        provider: {
          type: 'string',
          enum: ['systemd', 'docker', 'compose', 'managed-process'],
        },
        source: {
          type: 'string',
          enum: ['journal', 'compose', 'process', 'none'],
        },
        status: {
          type: 'string',
          enum: ['available', 'empty', 'unavailable', 'unsupported'],
        },
        state: {
          type: 'string',
          enum: [
            'running',
            'stopped',
            'starting',
            'stopping',
            'failed',
            'unknown',
          ],
        },
        readiness: { type: 'string', enum: ['ready', 'unhealthy', 'unknown'] },
        observedAt: { type: 'string' },
        readAt: { type: 'string' },
        stale: { type: 'boolean' },
        partial: { type: 'boolean' },
        masked: { type: 'boolean' },
        truncated: { type: 'boolean' },
        content: { type: 'string', maxLength: 65_536 },
        diagnostic: { type: 'string' },
        events: {
          type: 'array',
          maxItems: 20,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'type', 'occurredAt'],
            properties: {
              id: { type: 'string' },
              type: { type: 'string' },
              status: {
                type: 'string',
                enum: [
                  'started',
                  'succeeded',
                  'failed',
                  'cancelled',
                  'warning',
                ],
              },
              occurredAt: { type: 'string' },
              resourceRef: resourceRefSchema,
              jobId: { type: 'string' },
            },
          },
        },
        jobs: {
          type: 'array',
          maxItems: 20,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'action', 'status'],
            properties: {
              id: { type: 'string' },
              action: { type: 'string' },
              status: {
                type: 'string',
                enum: ['queued', 'running', 'succeeded', 'failed', 'cancelled'],
              },
              startedAt: { type: 'string' },
              finishedAt: { type: 'string' },
              resourceRef: resourceRefSchema,
            },
          },
        },
      },
    },
  },
} as const;

export const serviceDiagnosticsRoutes: FastifyPluginAsync<Options> = async (
  app,
  options,
) => {
  app.get<{ Params: Params; Querystring: Query }>(
    '/projects/:projectId/services/:serviceRef/diagnostics',
    {
      schema: {
        params: {
          type: 'object',
          additionalProperties: false,
          required: ['projectId', 'serviceRef'],
          properties: {
            projectId: { type: 'string', minLength: 1, maxLength: 160 },
            serviceRef: { type: 'string', minLength: 1, maxLength: 512 },
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
      // Fastify's shared AJV settings remove unknown query properties.
      // Reject them using the raw query before any provider can be accessed.
      const rawQuery = request.raw.url?.split('?', 2)[1] ?? '';
      const parameters = new URLSearchParams(rawQuery);
      if (
        [...parameters.keys()].some((key) => key !== 'environmentInstanceId') ||
        parameters.getAll('environmentInstanceId').length > 1
      ) {
        throw new ApiError({
          statusCode: 400,
          code: 'BAD_REQUEST',
          message: 'Unsupported or repeated diagnostics query parameter.',
        });
      }
      try {
        return {
          diagnostics: await options.diagnostics.read(
            request.params.projectId,
            request.params.serviceRef,
            request.query.environmentInstanceId,
          ),
        };
      } catch (error) {
        if (error instanceof ServiceDiagnosticsError) {
          throw new ApiError({
            statusCode: 404,
            code: 'NOT_FOUND',
            message: error.message,
          });
        }
        throw error;
      }
    },
  );
};
