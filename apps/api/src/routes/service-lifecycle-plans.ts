import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';

import { commonErrorResponseSchemas } from '../http/response-schemas.js';
import type { ServiceLifecyclePlanningService } from '../services/service-lifecycle-planning-service.js';

interface Options extends FastifyPluginOptions {
  planner: Pick<ServiceLifecyclePlanningService, 'preview'>;
}
interface Params {
  projectId: string;
}
interface Query {
  action: 'start' | 'stop';
  environmentInstanceId?: string;
  expectedPlanHash?: string;
  profileId?: string;
}

const properties = {
  serviceRef: { type: 'string' },
  name: { type: 'string' },
  provider: {
    type: 'string',
    enum: ['systemd', 'docker', 'compose', 'managed-process', 'unknown'],
  },
  disposition: {
    type: 'string',
    enum: [
      'willStart',
      'willStop',
      'alreadyReady',
      'retained',
      'blocked',
      'unsupported',
    ],
  },
  state: { type: 'string' },
  readiness: { type: 'string', enum: ['ready', 'unhealthy', 'unknown'] },
  relation: {
    type: 'string',
    enum: ['owned', 'required', 'observed', 'missing'],
  },
  ports: {
    type: 'array',
    items: { type: 'integer', minimum: 1, maximum: 65535 },
  },
  consumerCount: { type: 'integer', minimum: 0 },
  dependencies: { type: 'array', items: { type: 'string' } },
  diagnostic: { type: 'string' },
  systemdCapability: {
    type: 'object',
    additionalProperties: false,
    required: ['status', 'reason'],
    properties: {
      status: {
        type: 'string',
        enum: ['permission-required', 'unsupported', 'unknown'],
      },
      reason: { type: 'string' },
    },
  },
} as const;

const responseSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'target',
    'action',
    'status',
    'expectedRevision',
    'planHash',
    'observedAt',
    'expiresAt',
    'order',
    'nodes',
    'diagnostics',
    'executable',
  ],
  properties: {
    target: {
      type: 'object',
      additionalProperties: false,
      required: ['kind', 'projectId', 'environmentInstanceId'],
      properties: {
        kind: { type: 'string', enum: ['project-environment'] },
        projectId: { type: 'string' },
        environmentInstanceId: { type: 'string' },
      },
    },
    action: { type: 'string', enum: ['start', 'stop'] },
    status: { type: 'string', enum: ['ready', 'blocked'] },
    expectedRevision: { type: 'string', pattern: '^[a-f0-9]{64}$' },
    profile: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'kind', 'revision'],
      properties: {
        id: { type: 'string' },
        kind: { type: 'string', enum: ['dev', 'test', 'production'] },
        revision: { type: 'string', pattern: '^[a-f0-9]{64}$' },
      },
    },
    planHash: { type: 'string', pattern: '^[a-f0-9]{64}$' },
    observedAt: { type: 'string' },
    expiresAt: { type: 'string' },
    order: { type: 'array', maxItems: 250, items: { type: 'string' } },
    nodes: {
      type: 'array',
      maxItems: 250,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'serviceRef',
          'name',
          'provider',
          'disposition',
          'state',
          'readiness',
          'relation',
          'ports',
          'consumerCount',
          'dependencies',
        ],
        properties,
      },
    },
    diagnostics: { type: 'array', items: { type: 'string' } },
    executable: { type: 'boolean', enum: [false] },
  },
} as const;

export const serviceLifecyclePlanRoutes: FastifyPluginAsync<Options> = async (
  app,
  options,
) => {
  app.get<{ Params: Params; Querystring: Query }>(
    '/projects/:projectId/service-plan',
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
          required: ['action'],
          properties: {
            action: { type: 'string', enum: ['start', 'stop'] },
            environmentInstanceId: {
              type: 'string',
              minLength: 1,
              maxLength: 512,
            },
            expectedPlanHash: { type: 'string', pattern: '^[a-f0-9]{64}$' },
            profileId: {
              type: 'string',
              pattern:
                '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
            },
          },
        },
        response: { 200: responseSchema, ...commonErrorResponseSchemas },
      },
    },
    async (request) =>
      options.planner.preview(
        request.params.projectId,
        request.query.action,
        request.query.environmentInstanceId,
        request.query.expectedPlanHash,
        request.query.profileId,
      ),
  );
};
