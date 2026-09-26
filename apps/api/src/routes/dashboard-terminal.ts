import type { FastifyPluginAsync } from 'fastify';

import { withWebSocketMessageRateLimit } from '../security/rate-limited-websocket.js';
import type { DashboardTerminalService } from '../services/dashboard-terminal-service.js';

interface DashboardTerminalRouteOptions {
  dashboardTerminalService: DashboardTerminalService;
}

interface ConnectQuery {
  confirmationToken?: string;
}

const connectQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    confirmationToken: { type: 'string', minLength: 64, maxLength: 64 },
  },
} as const;

const confirmationSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['token', 'expiresAt'],
  properties: {
    token: { type: 'string' },
    expiresAt: { type: 'string' },
  },
} as const;

export const dashboardTerminalRoutes: FastifyPluginAsync<
  DashboardTerminalRouteOptions
> = async (app, options) => {
  app.post(
    '/dashboard/terminal/confirmations',
    {
      schema: {
        response: {
          201: {
            type: 'object',
            additionalProperties: false,
            required: ['confirmation'],
            properties: { confirmation: confirmationSchema },
          },
        },
      },
    },
    async (_request, reply) =>
      reply.code(201).send({
        confirmation: options.dashboardTerminalService.prepareConfirmation(),
      }),
  );

  app.get<{ Querystring: ConnectQuery }>(
    '/dashboard/terminal/connect',
    {
      websocket: true,
      schema: { querystring: connectQuerySchema },
    },
    (socket, request) => {
      const limitedSocket = withWebSocketMessageRateLimit(socket);
      void options.dashboardTerminalService
        .attach(request.query.confirmationToken, limitedSocket)
        .catch((error: unknown) => {
          request.log.error(
            { err: error },
            'Falha ao iniciar o modo terminal do Dev Dashboard.',
          );
          limitedSocket.close(1011, 'Falha ao iniciar modo terminal');
        });
    },
  );
};
