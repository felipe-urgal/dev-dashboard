import type { FastifyPluginAsync } from 'fastify';

import { commonErrorResponseSchemas } from '../http/response-schemas.js';

const REVISION_PATTERN = /^[0-9a-f]{40,64}$/;

function runtimeRevision(): string | undefined {
  const revision = process.env.DEV_DASHBOARD_RUNTIME_REVISION?.trim();
  return revision && REVISION_PATTERN.test(revision) ? revision : undefined;
}

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/health',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['status', 'service', 'timestamp'],
            properties: {
              status: {
                type: 'string',
              },
              service: {
                type: 'string',
              },
              timestamp: {
                type: 'string',
              },
              revision: {
                type: 'string',
                pattern: '^[0-9a-f]{40,64}$',
              },
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async () => {
      const revision = runtimeRevision();
      return {
        status: 'ok',
        service: 'dev-dashboard-api',
        timestamp: new Date().toISOString(),
        ...(revision ? { revision } : {}),
      };
    },
  );
};
