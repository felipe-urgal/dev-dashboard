import type { FastifyInstance } from 'fastify';

import {
  commonErrorResponseSchemas,
  railsMigrationsOverviewResponseSchema,
  railsRoutesOverviewResponseSchema,
} from '../../http/response-schemas.js';
import {
  databaseQuerySchema,
  migrationParamsSchema,
  paramsSchema,
  railsMigrationDetailResponseSchema,
  railsModelsOverviewResponseSchema,
  requireProject,
  type DatabaseQuery,
  type MigrationParams,
  type Params,
  type RailsRouteOptions,
} from './helpers.js';

export function registerRailsReadRoutes(
  app: FastifyInstance,
  options: RailsRouteOptions,
): void {
  app.get<{ Params: Params; Querystring: DatabaseQuery }>(
    '/projects/:projectId/rails/migrations',
    {
      schema: {
        params: paramsSchema,
        querystring: databaseQuerySchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['migrations'],
            properties: { migrations: railsMigrationsOverviewResponseSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => ({
      migrations: await options.railsInspectionService.getMigrationsOverview(
        requireProject(options.projectStore, request.params.projectId),
        request.query.database,
      ),
    }),
  );

  app.get<{ Params: MigrationParams; Querystring: DatabaseQuery }>(
    '/projects/:projectId/rails/migrations/:version',
    {
      schema: {
        params: migrationParamsSchema,
        querystring: databaseQuerySchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['migration'],
            properties: { migration: railsMigrationDetailResponseSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => ({
      migration: await options.railsInspectionService.getMigrationDetail(
        requireProject(options.projectStore, request.params.projectId),
        request.params.version,
        request.query.database,
      ),
    }),
  );

  app.get<{ Params: Params; Querystring: DatabaseQuery }>(
    '/projects/:projectId/rails/models',
    {
      schema: {
        params: paramsSchema,
        querystring: databaseQuerySchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['models'],
            properties: { models: railsModelsOverviewResponseSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => ({
      models: await options.railsInspectionService.getModelsOverview(
        requireProject(options.projectStore, request.params.projectId),
        request.query.database,
      ),
    }),
  );

  app.get<{ Params: Params }>(
    '/projects/:projectId/rails/routes',
    {
      schema: {
        params: paramsSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['routes'],
            properties: { routes: railsRoutesOverviewResponseSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => ({
      routes: await options.railsInspectionService.getRoutesOverview(
        requireProject(options.projectStore, request.params.projectId),
      ),
    }),
  );
}
