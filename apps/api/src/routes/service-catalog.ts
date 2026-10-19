import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';

import type { ServiceCatalogService } from '../services/service-catalog-service.js';
import { commonErrorResponseSchemas } from '../http/response-schemas.js';

interface Options extends FastifyPluginOptions {
  catalog: Pick<ServiceCatalogService, 'inspect'>;
}

const stateValues = ['running', 'starting', 'stopping', 'stopped', 'failed', 'unknown'] as const;
const providerValues = ['systemd', 'docker', 'compose', 'managed-process'] as const;
const statusValues = ['ready', 'partial', 'unavailable', 'unsupported'] as const;

const catalogServiceSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id', 'provider', 'name', 'state', 'readiness', 'ownership',
    'scope', 'ports', 'observedAt',
  ],
  properties: {
    id: { type: 'string' },
    provider: { type: 'string', enum: providerValues },
    name: { type: 'string' },
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
      required: ['status', 'observedAt', 'entries', 'ports', 'providers', 'truncated'],
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
      },
    },
  },
} as const;

export const serviceCatalogRoutes: FastifyPluginAsync<Options> = async (app, options) => {
  app.get(
    '/services/catalog',
    { schema: { response: { 200: responseSchema, ...commonErrorResponseSchemas } } },
    async () => ({ catalog: await options.catalog.inspect() }),
  );
};
