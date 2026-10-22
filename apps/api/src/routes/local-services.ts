import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';
import { commonErrorResponseSchemas } from '../http/response-schemas.js';
import {
  LocalServiceControlError,
  type LocalServiceAction,
  type LocalServiceManager,
} from '../services/local-service-manager.js';

interface Options extends FastifyPluginOptions {
  manager: Pick<LocalServiceManager, 'snapshot' | 'plan' | 'apply'>;
}
const actionSchema = {
  type: 'string',
  enum: ['start', 'stop', 'restart'],
} as const;

export const localServiceRoutes: FastifyPluginAsync<Options> = async (
  app,
  options,
) => {
  app.get('/local-services', async () => ({
    services: [await options.manager.snapshot()],
  }));

  app.get<{ Querystring: { action: LocalServiceAction } }>(
    '/local-services/home-music/plan',
    {
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          required: ['action'],
          properties: { action: actionSchema },
        },
        response: { ...commonErrorResponseSchemas },
      },
    },
    async (request, reply) => {
      try {
        return { plan: await options.manager.plan(request.query.action) };
      } catch (error) {
        if (error instanceof LocalServiceControlError) {
          return reply
            .code(error.statusCode)
            .send({
              error: error.statusCode === 403 ? 'FORBIDDEN' : 'CONFLICT',
              message: error.message,
            });
        }
        throw error;
      }
    },
  );

  app.post<{ Body: { action: LocalServiceAction; confirmation: string } }>(
    '/local-services/home-music/actions',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['action', 'confirmation'],
          properties: {
            action: actionSchema,
            confirmation: { type: 'string', pattern: '^[a-f0-9]{64}$' },
          },
        },
        response: { ...commonErrorResponseSchemas },
      },
    },
    async (request, reply) => {
      try {
        return {
          outcome: await options.manager.apply(
            request.body.action,
            request.body.confirmation,
          ),
        };
      } catch (error) {
        if (error instanceof LocalServiceControlError) {
          const code =
            error.statusCode === 403
              ? 'FORBIDDEN'
              : error.statusCode === 503
                ? 'INTERNAL_ERROR'
                : 'CONFLICT';
          return reply
            .code(error.statusCode)
            .send({ error: code, message: error.message });
        }
        throw error;
      }
    },
  );
};
