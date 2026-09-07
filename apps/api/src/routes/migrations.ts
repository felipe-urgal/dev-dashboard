import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';

import { ApiError } from '../http/api-error.js';
import { commonErrorResponseSchemas } from '../http/response-schemas.js';
import type { MigrationOverviewService } from '../services/migration-overview-service.js';
import type { ProjectStore } from '../store/project-store.js';

interface Options extends FastifyPluginOptions {
  projectStore: ProjectStore;
  migrationOverviewService: Pick<MigrationOverviewService, 'inspect'>;
}

interface Params {
  projectId: string;
}

interface Querystring {
  database?: string;
}

const paramsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId'],
  properties: {
    projectId: { type: 'string', minLength: 1 },
  },
} as const;

const querystringSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    database: {
      type: 'string',
      minLength: 1,
      maxLength: 128,
      pattern: '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$',
    },
  },
} as const;

const migrationEntrySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id'],
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
  },
} as const;

const migrationOverviewSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'provider',
    'status',
    'database',
    'applied',
    'pending',
    'observedAt',
    'evidence',
    'warnings',
  ],
  properties: {
    provider: { type: 'string' },
    status: {
      type: 'string',
      enum: ['up-to-date', 'pending', 'unavailable', 'unknown'],
    },
    database: { type: 'string' },
    applied: { type: 'array', items: migrationEntrySchema },
    pending: { type: 'array', items: migrationEntrySchema },
    observedAt: { type: 'string' },
    evidence: { type: 'string' },
    warnings: { type: 'array', items: { type: 'string' } },
  },
} as const;

function requireProject(store: ProjectStore, projectId: string) {
  const project = store.findProject(projectId);
  if (!project) {
    throw new ApiError({
      statusCode: 404,
      code: 'PROJECT_NOT_FOUND',
      message: 'Projeto não encontrado.',
    });
  }
  return project;
}

export const migrationRoutes: FastifyPluginAsync<Options> = async (
  app,
  options,
) => {
  app.get<{
    Params: Params;
    Querystring: Querystring;
  }>(
    '/projects/:projectId/migrations',
    {
      schema: {
        params: paramsSchema,
        querystring: querystringSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['migration'],
            properties: {
              migration: migrationOverviewSchema,
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = requireProject(
        options.projectStore,
        request.params.projectId,
      );
      return {
        migration: await options.migrationOverviewService.inspect(
          project,
          request.query.database,
        ),
      };
    },
  );
};
