import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';

import type { ServiceCatalogService } from '../services/service-catalog-service.js';
import { commonErrorResponseSchemas } from '../http/response-schemas.js';

interface Options extends FastifyPluginOptions {
  catalog: Pick<ServiceCatalogService, 'inspect'>;
}

const stateValues = [
  'running',
  'starting',
  'stopping',
  'stopped',
  'failed',
  'unknown',
] as const;
const providerValues = [
  'systemd',
  'docker',
  'compose',
  'managed-process',
] as const;
const statusValues = [
  'ready',
  'partial',
  'unavailable',
  'unsupported',
] as const;

const catalogServiceSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'provider',
    'name',
    'displayName',
    'evidence',
    'capabilities',
    'state',
    'readiness',
    'ownership',
    'scope',
    'ports',
    'observedAt',
  ],
  properties: {
    id: { type: 'string' },
    provider: { type: 'string', enum: providerValues },
    name: { type: 'string' },
    displayName: { type: 'string' },
    evidence: {
      type: 'object',
      additionalProperties: false,
      required: ['source', 'identity'],
      properties: {
        source: {
          type: 'string',
          enum: ['systemd', 'docker-cli', 'compose-owner', 'process-manager'],
        },
        identity: { type: 'string' },
      },
    },
    capabilities: {
      type: 'object',
      additionalProperties: false,
      required: ['observe', 'start', 'stop', 'restart', 'boot-policy'],
      properties: {
        observe: { type: 'string', enum: ['supported'] },
        start: { type: 'string', enum: ['unsupported'] },
        stop: { type: 'string', enum: ['unsupported'] },
        restart: { type: 'string', enum: ['unsupported'] },
        'boot-policy': { type: 'string', enum: ['unsupported'] },
      },
    },
    enabledAtBoot: {
      type: 'string',
      enum: [
        'enabled',
        'disabled',
        'static',
        'masked',
        'indirect',
        'linked',
        'generated',
        'transient',
        'unknown',
      ],
    },
    state: { type: 'string', enum: stateValues },
    readiness: { type: 'string', enum: ['ready', 'unhealthy', 'unknown'] },
    ownership: { type: 'string', enum: ['confirmed', 'unmanaged', 'unknown'] },
    scope: { type: 'string' },
    projectId: { type: 'string' },
    environmentInstanceId: { type: 'string' },
    ports: {
      type: 'array',
      maxItems: 100,
      items: { type: 'integer', minimum: 1, maximum: 65535 },
    },
    observedAt: { type: 'string' },
    diagnostic: { type: 'string' },
  },
} as const;

const responseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['catalog'],
  properties: {
    catalog: {
      type: 'object',
      additionalProperties: false,
      required: [
        'status',
        'observedAt',
        'entries',
        'ports',
        'providers',
        'truncated',
      ],
      properties: {
        status: { type: 'string', enum: statusValues },
        observedAt: { type: 'string' },
        entries: { type: 'array', maxItems: 250, items: catalogServiceSchema },
        ports: {
          type: 'array',
          maxItems: 100,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['port', 'address', 'conflict'],
            properties: {
              port: { type: 'integer', minimum: 1, maximum: 65535 },
              address: { type: 'string' },
              conflict: { type: 'boolean' },
              managedProcessId: { type: 'string' },
            },
          },
        },
        providers: {
          type: 'array',
          maxItems: 5,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['provider', 'status'],
            properties: {
              provider: { type: 'string', enum: [...providerValues, 'ports'] },
              status: { type: 'string', enum: statusValues },
              diagnostic: { type: 'string' },
            },
          },
        },
        truncated: { type: 'boolean' },
        page: {
          type: 'object',
          additionalProperties: false,
          required: ['offset', 'limit', 'hasMore', 'incomplete'],
          properties: {
            offset: { type: 'integer' },
            limit: { type: 'integer' },
            hasMore: { type: 'boolean' },
            incomplete: { type: 'boolean' },
          },
        },
      },
    },
  },
} as const;

const querySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    offset: { type: 'integer', minimum: 0, maximum: 249 },
    limit: { type: 'integer', minimum: 1, maximum: 100 },
  },
} as const;

export const serviceCatalogRoutes: FastifyPluginAsync<Options> = async (
  app,
  options,
) => {
  app.get<{ Querystring: { offset?: number; limit?: number } }>(
    '/services/catalog',
    {
      schema: {
        querystring: querySchema,
        response: { 200: responseSchema, ...commonErrorResponseSchemas },
      },
    },
    async (request) => {
      const catalog = await options.catalog.inspect();
      const { offset, limit } = request.query;
      if (offset === undefined && limit === undefined) return { catalog };
      const start = offset ?? 0;
      const pageLimit = limit ?? 100;
      return {
        catalog: {
          ...catalog,
          entries: catalog.entries.slice(start, start + pageLimit),
          page: {
            offset: start,
            limit: pageLimit,
            hasMore: catalog.entries.length > start + pageLimit,
            incomplete: catalog.truncated,
          },
        },
      };
    },
  );
};
