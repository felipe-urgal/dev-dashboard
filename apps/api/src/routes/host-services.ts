import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';

import { commonErrorResponseSchemas } from '../http/response-schemas.js';
import type { SystemdServiceInventory } from '../services/systemd-service-inventory.js';

interface Options extends FastifyPluginOptions {
  inventory: Pick<SystemdServiceInventory, 'inspect'>;
}

const sourceSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['scope', 'status'],
  properties: {
    scope: { type: 'string', enum: ['user', 'system'] },
    status: {
      type: 'string',
      enum: ['ready', 'partial', 'unavailable', 'unsupported'],
    },
    diagnostic: { type: 'string' },
  },
} as const;

const serviceSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'provider',
    'scope',
    'name',
    'state',
    'readiness',
    'bootState',
    'managed',
    'observedAt',
  ],
  properties: {
    id: { type: 'string' },
    provider: { type: 'string', enum: ['systemd'] },
    scope: { type: 'string', enum: ['user', 'system'] },
    name: { type: 'string' },
    state: {
      type: 'string',
      enum: ['running', 'starting', 'stopping', 'stopped', 'failed', 'unknown'],
    },
    readiness: { type: 'string', enum: ['unknown'] },
    bootState: {
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
    managed: { type: 'boolean', enum: [false] },
    observedAt: { type: 'string' },
    diagnostic: { type: 'string' },
    activeState: { type: 'string', enum: ['active', 'inactive', 'activating', 'deactivating', 'failed', 'reloading', 'unknown'] },
    subState: { type: 'string', enum: ['running', 'dead', 'exited', 'failed', 'waiting', 'unknown'] },
    fragmentKind: { type: 'string', enum: ['persistent', 'runtime', 'none', 'unknown'] },
    unitKind: { type: 'string', enum: ['regular', 'template', 'instance', 'transient', 'generated'] },
  },
} as const;

const responseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['inventory'],
  properties: {
    inventory: {
      type: 'object',
      additionalProperties: false,
      required: ['status', 'observedAt', 'services', 'sources', 'truncated'],
      properties: {
        status: {
          type: 'string',
          enum: ['ready', 'partial', 'unavailable', 'unsupported'],
        },
        observedAt: { type: 'string' },
        services: { type: 'array', maxItems: 200, items: serviceSchema },
        sources: { type: 'array', maxItems: 2, items: sourceSchema },
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
    offset: { type: 'integer', minimum: 0, maximum: 199 },
    limit: { type: 'integer', minimum: 1, maximum: 100 },
  },
} as const;

export const hostServiceRoutes: FastifyPluginAsync<Options> = async (
  app,
  options,
) => {
  app.get<{ Querystring: { offset?: number; limit?: number } }>(
    '/services/inventory',
    {
      schema: {
        querystring: querySchema,
        response: {
          200: responseSchema,
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const inventory = await options.inventory.inspect();
      const { offset, limit } = request.query;
      if (offset === undefined && limit === undefined) return { inventory };
      const start = offset ?? 0;
      const pageLimit = limit ?? 100;
      return {
        inventory: {
          ...inventory,
          services: inventory.services.slice(start, start + pageLimit),
          page: {
            offset: start,
            limit: pageLimit,
            hasMore: inventory.services.length > start + pageLimit,
            incomplete: inventory.truncated,
          },
        },
      };
    },
  );
};
