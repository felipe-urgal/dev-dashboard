import type { FastifyPluginAsync } from 'fastify';

import { commonErrorResponseSchemas } from '../http/response-schemas.js';

const RUNTIME_REVISION_PATTERN = /^[0-9a-f]{40,64}$/;
const RUNTIME_REVISION_HEADER = 'x-dev-dashboard-revision';

export function resolveRuntimeRevision(
  environment: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const revision = environment.DEV_DASHBOARD_RUNTIME_REVISION?.trim();
  return revision && RUNTIME_REVISION_PATTERN.test(revision)
    ? revision
    : undefined;
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
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (_request, reply) => {
      const revision = resolveRuntimeRevision();
      if (revision) reply.header(RUNTIME_REVISION_HEADER, revision);

      return {
        status: 'ok',
        service: 'dev-dashboard-api',
        timestamp: new Date().toISOString(),
      };
    },
  );
};
