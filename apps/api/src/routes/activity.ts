import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';

import { ApiError } from '../http/api-error.js';
import { commonErrorResponseSchemas } from '../http/response-schemas.js';
import {
  ActivitySnapshotServiceError,
  type ActivitySnapshotService,
} from '../services/activity-snapshot-service.js';

interface Options extends FastifyPluginOptions {
  activitySnapshotService: Pick<
    ActivitySnapshotService,
    'readProject' | 'readGlobal'
  >;
}

interface ProjectParams {
  projectId: string;
}

interface ActivityQuery {
  limit?: number;
}

const projectParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId'],
  properties: {
    projectId: { type: 'string', minLength: 1 },
  },
} as const;

const activityQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    limit: { type: 'integer', minimum: 1, maximum: 200 },
  },
} as const;

const domainValues = [
  'process',
  'test',
  'script',
  'git',
  'database',
  'compose',
  'deployment',
  'ci',
  'security',
] as const;

const resourceRefSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'id'],
  properties: {
    kind: { type: 'string' },
    id: { type: 'string' },
  },
} as const;

const activityEventSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'projectId',
    'domain',
    'type',
    'summary',
    'occurredAt',
  ],
  properties: {
    id: { type: 'string' },
    projectId: { type: 'string' },
    environmentInstanceId: { type: 'string' },
    domain: { type: 'string', enum: domainValues },
    type: { type: 'string' },
    status: {
      type: 'string',
      enum: ['started', 'succeeded', 'failed', 'cancelled', 'warning'],
    },
    summary: { type: 'string' },
    occurredAt: { type: 'string' },
    resourceRef: resourceRefSchema,
    jobId: { type: 'string' },
  },
} as const;

const activityJobSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'projectId',
    'domain',
    'action',
    'status',
    'cancelSupported',
  ],
  properties: {
    id: { type: 'string' },
    projectId: { type: 'string' },
    environmentInstanceId: { type: 'string' },
    domain: { type: 'string', enum: domainValues },
    action: { type: 'string' },
    status: {
      type: 'string',
      enum: ['queued', 'running', 'succeeded', 'failed', 'cancelled'],
    },
    startedAt: { type: 'string' },
    finishedAt: { type: 'string' },
    resourceRef: resourceRefSchema,
    cancelSupported: { type: 'boolean' },
  },
} as const;

const activitySnapshotSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'generatedAt',
    'partial',
    'unavailableDomains',
    'events',
    'jobs',
  ],
  properties: {
    generatedAt: { type: 'string' },
    partial: { type: 'boolean' },
    unavailableDomains: {
      type: 'array',
      items: { type: 'string', enum: domainValues },
    },
    events: { type: 'array', items: activityEventSchema },
    jobs: { type: 'array', items: activityJobSchema },
  },
} as const;

const activityResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['activity'],
  properties: {
    activity: activitySnapshotSchema,
  },
} as const;

function mapActivityError(error: unknown): unknown {
  if (
    error instanceof ActivitySnapshotServiceError &&
    error.code === 'ACTIVITY_PROJECT_NOT_FOUND'
  ) {
    return new ApiError({
      statusCode: 404,
      code: 'PROJECT_NOT_FOUND',
      message: error.message,
    });
  }
  return error;
}

async function withActivityErrors<T>(
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw mapActivityError(error);
  }
}

export const activityRoutes: FastifyPluginAsync<Options> = async (
  app,
  options,
) => {
  app.get<{ Querystring: ActivityQuery }>(
    '/activity',
    {
      schema: {
        querystring: activityQuerySchema,
        response: {
          200: activityResponseSchema,
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) =>
      withActivityErrors(async () => ({
        activity: await options.activitySnapshotService.readGlobal(
          request.query.limit,
        ),
      })),
  );

  app.get<{ Params: ProjectParams; Querystring: ActivityQuery }>(
    '/projects/:projectId/activity',
    {
      schema: {
        params: projectParamsSchema,
        querystring: activityQuerySchema,
        response: {
          200: activityResponseSchema,
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) =>
      withActivityErrors(async () => ({
        activity: await options.activitySnapshotService.readProject(
          request.params.projectId,
          request.query.limit,
        ),
      })),
  );
};
