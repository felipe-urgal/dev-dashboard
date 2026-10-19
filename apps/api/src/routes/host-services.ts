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
      },
    },
  },
} as const;

export const hostServiceRoutes: FastifyPluginAsync<Options> = async (
  app,
  options,
) => {
  app.get(
    '/services/inventory',
    {
      schema: {
        response: {
          200: responseSchema,
          ...commonErrorResponseSchemas,
        },
      },
    },
    async () => ({ inventory: await options.inventory.inspect() }),
  );
};
