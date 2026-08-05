import type { FastifyInstance } from 'fastify';

import { commonErrorResponseSchemas } from '../../http/response-schemas.js';
import { railsCredentialsOverviewResponseSchema } from '../../http/response-schemas/rails.js';
import {
  paramsSchema,
  requireProject,
  type Params,
  type RailsRouteOptions,
} from './helpers.js';

/**
 * Somente leitura: relata a existência de `config/credentials.yml.enc`,
 * `config/master.key` e das variantes por ambiente. Nunca lê ou expõe o
 * conteúdo criptografado nem o valor de nenhuma chave — editar credentials
 * fica fora do escopo desta entrega (ver task 095).
 */
export function registerRailsCredentialsRoutes(
  app: FastifyInstance,
  options: RailsRouteOptions,
): void {
  app.get<{ Params: Params }>('/projects/:projectId/rails/credentials', {
    schema: {
      params: paramsSchema,
      response: {
        200: {
          type: 'object', additionalProperties: false, required: ['credentials'],
          properties: { credentials: railsCredentialsOverviewResponseSchema },
        },
        ...commonErrorResponseSchemas,
      },
    },
  }, async (request) => ({
    credentials: await options.railsRuntimeService.getCredentialsOverview(
      requireProject(options.projectStore, request.params.projectId),
    ),
  }));
}
