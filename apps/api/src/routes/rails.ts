import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';

import type { RailsGeneratorField, RailsGeneratorKind, RailsMigrationMutationOperation } from '@dev-dashboard/contracts';

import { ApiError } from '../http/api-error.js';
import {
  commonErrorResponseSchemas,
  railsMigrationMutationConfirmationResponseSchema,
  railsMigrationMutationResultResponseSchema,
  railsMigrationsOverviewResponseSchema,
  railsRoutesOverviewResponseSchema,
} from '../http/response-schemas.js';
import { RailsMutationError, type RailsInspectionService } from '../services/rails-inspection-service.js';
import type { ProjectStore } from '../store/project-store.js';

interface Options extends FastifyPluginOptions {
  projectStore: ProjectStore;
  railsInspectionService: RailsInspectionService;
}

interface Params {
  projectId: string;
}

interface MigrationParams extends Params {
  version: string;
}

interface DatabaseQuery {
  database?: string;
}

interface MutationConfirmationBody {
  operation: RailsMigrationMutationOperation;
}

interface MutationBody {
  operation: RailsMigrationMutationOperation;
  confirmationToken: string;
}

interface GeneratorConfirmationBody {
  kind: RailsGeneratorKind;
  name: string;
  fields: RailsGeneratorField[];
  database?: string;
}

interface GeneratorMutationBody {
  confirmationToken: string;
}

const paramsSchema = {
  type: 'object', additionalProperties: false, required: ['projectId'],
  properties: { projectId: { type: 'string', minLength: 1 } },
} as const;

const migrationParamsSchema = {
  type: 'object', additionalProperties: false, required: ['projectId', 'version'],
  properties: {
    projectId: { type: 'string', minLength: 1 },
    version: { type: 'string', pattern: '^[0-9]{8,20}$' },
  },
} as const;

const databaseQuerySchema = {
  type: 'object', additionalProperties: false,
  properties: { database: { type: 'string', pattern: '^[a-z][a-z0-9_]*$', maxLength: 60 } },
} as const;

const mutationOperationEnum = ['migrate', 'rollback', 'seed', 'prepare'] as const;

const mutationConfirmationBodySchema = {
  type: 'object', additionalProperties: false, required: ['operation'],
  properties: { operation: { type: 'string', enum: mutationOperationEnum } },
} as const;

const mutationBodySchema = {
  type: 'object', additionalProperties: false, required: ['operation', 'confirmationToken'],
  properties: {
    operation: { type: 'string', enum: mutationOperationEnum },
    confirmationToken: { type: 'string', minLength: 64, maxLength: 64 },
  },
} as const;

const railsMigrationDetailResponseSchema = {
  type: 'object', additionalProperties: false,
  required: ['supported', 'version', 'truncated'],
  properties: {
    supported: { type: 'boolean' },
    version: { type: 'string' },
    name: { type: 'string' },
    status: { type: 'string', enum: ['up', 'down'] },
    filePath: { type: 'string' },
    source: { type: 'string' },
    truncated: { type: 'boolean' },
  },
} as const;

const railsSchemaColumnResponseSchema = {
  type: 'object', additionalProperties: false,
  required: ['name', 'type', 'nullable', 'primaryKey'],
  properties: {
    name: { type: 'string' },
    type: { type: 'string' },
    nullable: { type: 'boolean' },
    primaryKey: { type: 'boolean' },
    default: { type: 'string' },
    limit: { type: 'integer' },
    precision: { type: 'integer' },
    scale: { type: 'integer' },
  },
} as const;

const railsSchemaIndexResponseSchema = {
  type: 'object', additionalProperties: false,
  required: ['columns', 'unique'],
  properties: {
    name: { type: 'string' },
    columns: { type: 'array', items: { type: 'string' } },
    unique: { type: 'boolean' },
  },
} as const;

const railsSchemaForeignKeyResponseSchema = {
  type: 'object', additionalProperties: false,
  required: ['fromTable', 'toTable', 'column'],
  properties: {
    fromTable: { type: 'string' },
    toTable: { type: 'string' },
    column: { type: 'string' },
    primaryKey: { type: 'string' },
    name: { type: 'string' },
  },
} as const;

const railsSchemaTableResponseSchema = {
  type: 'object', additionalProperties: false,
  required: ['name', 'columns', 'indexes', 'foreignKeys'],
  properties: {
    name: { type: 'string' },
    columns: { type: 'array', items: railsSchemaColumnResponseSchema },
    indexes: { type: 'array', items: railsSchemaIndexResponseSchema },
    foreignKeys: { type: 'array', items: railsSchemaForeignKeyResponseSchema },
  },
} as const;

const railsModelsOverviewResponseSchema = {
  type: 'object', additionalProperties: false,
  required: ['supported', 'databases', 'tables'],
  properties: {
    supported: { type: 'boolean' },
    databases: { type: 'array', items: { type: 'string' } },
    schemaPath: { type: 'string' },
    tables: { type: 'array', items: railsSchemaTableResponseSchema },
  },
} as const;

const generatorKindEnum = ['model', 'migration'] as const;
const generatorFieldTypeEnum = [
  'string', 'text', 'integer', 'bigint', 'float', 'decimal',
  'boolean', 'date', 'datetime', 'time', 'timestamp', 'binary',
  'references', 'uuid',
] as const;

const generatorFieldSchema = {
  type: 'object', additionalProperties: false, required: ['name', 'type'],
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 60 },
    type: { type: 'string', enum: generatorFieldTypeEnum },
  },
} as const;

const generatorConfirmationBodySchema = {
  type: 'object', additionalProperties: false, required: ['kind', 'name', 'fields'],
  properties: {
    kind: { type: 'string', enum: generatorKindEnum },
    name: { type: 'string', minLength: 1, maxLength: 60 },
    fields: { type: 'array', maxItems: 25, items: generatorFieldSchema },
    database: { type: 'string', pattern: '^[a-z][a-z0-9_]*$', maxLength: 60 },
  },
} as const;

const generatorMutationBodySchema = {
  type: 'object', additionalProperties: false, required: ['confirmationToken'],
  properties: { confirmationToken: { type: 'string', minLength: 64, maxLength: 64 } },
} as const;

const railsGeneratorConfirmationResponseSchema = {
  type: 'object', additionalProperties: false,
  required: ['token', 'kind', 'name', 'fields', 'command', 'expiresAt'],
  properties: {
    token: { type: 'string' },
    kind: { type: 'string', enum: generatorKindEnum },
    name: { type: 'string' },
    fields: { type: 'array', items: generatorFieldSchema },
    database: { type: 'string' },
    command: { type: 'string' },
    expiresAt: { type: 'string' },
  },
} as const;

const railsGeneratorResultResponseSchema = {
  type: 'object', additionalProperties: false,
  required: ['kind', 'name', 'succeeded', 'createdFiles', 'output', 'truncated', 'masked', 'redactionCount'],
  properties: {
    kind: { type: 'string', enum: generatorKindEnum },
    name: { type: 'string' },
    succeeded: { type: 'boolean' },
    createdFiles: { type: 'array', items: { type: 'string' } },
    output: { type: 'string' },
    truncated: { type: 'boolean' },
    masked: { type: 'boolean' },
    redactionCount: { type: 'integer', minimum: 0 },
  },
} as const;

function requireProject(store: ProjectStore, id: string) {
  const project = store.findProject(id);
  if (!project) throw new ApiError({ statusCode: 404, code: 'PROJECT_NOT_FOUND', message: 'Projeto não encontrado.' });
  return project;
}

function translateMutationError(error: unknown): never {
  if (error instanceof RailsMutationError) {
    const statuses: Record<string, number> = {
      RAILS_MUTATION_UNSUPPORTED: 409,
      RAILS_MUTATION_CONFIRMATION_REQUIRED: 409,
      RAILS_GENERATOR_UNSUPPORTED: 409,
      RAILS_GENERATOR_CONFIRMATION_REQUIRED: 409,
      RAILS_GENERATOR_INVALID_INPUT: 400,
    };
    throw new ApiError({ statusCode: statuses[error.code] ?? 400, code: error.code, message: error.message });
  }
  throw new ApiError({
    statusCode: 500, code: 'RAILS_MUTATION_FAILED',
    message: error instanceof Error ? error.message : 'Não foi possível concluir a operação Rails.',
  });
}

export const railsRoutes: FastifyPluginAsync<Options> = async (app, options) => {
  app.get<{ Params: Params; Querystring: DatabaseQuery }>('/projects/:projectId/rails/migrations', {
    schema: {
      params: paramsSchema,
      querystring: databaseQuerySchema,
      response: {
        200: {
          type: 'object', additionalProperties: false, required: ['migrations'],
          properties: { migrations: railsMigrationsOverviewResponseSchema },
        },
        ...commonErrorResponseSchemas,
      },
    },
  }, async (request) => ({
    migrations: await options.railsInspectionService.getMigrationsOverview(
      requireProject(options.projectStore, request.params.projectId),
      request.query.database,
    ),
  }));

  app.get<{ Params: MigrationParams; Querystring: DatabaseQuery }>('/projects/:projectId/rails/migrations/:version', {
    schema: {
      params: migrationParamsSchema,
      querystring: databaseQuerySchema,
      response: {
        200: {
          type: 'object', additionalProperties: false, required: ['migration'],
          properties: { migration: railsMigrationDetailResponseSchema },
        },
        ...commonErrorResponseSchemas,
      },
    },
  }, async (request) => ({
    migration: await options.railsInspectionService.getMigrationDetail(
      requireProject(options.projectStore, request.params.projectId),
      request.params.version,
      request.query.database,
    ),
  }));

  app.get<{ Params: Params; Querystring: DatabaseQuery }>('/projects/:projectId/rails/models', {
    schema: {
      params: paramsSchema,
      querystring: databaseQuerySchema,
      response: {
        200: {
          type: 'object', additionalProperties: false, required: ['models'],
          properties: { models: railsModelsOverviewResponseSchema },
        },
        ...commonErrorResponseSchemas,
      },
    },
  }, async (request) => ({
    models: await options.railsInspectionService.getModelsOverview(
      requireProject(options.projectStore, request.params.projectId),
      request.query.database,
    ),
  }));

  app.get<{ Params: Params }>('/projects/:projectId/rails/routes', {
    schema: {
      params: paramsSchema,
      response: {
        200: {
          type: 'object', additionalProperties: false, required: ['routes'],
          properties: { routes: railsRoutesOverviewResponseSchema },
        },
        ...commonErrorResponseSchemas,
      },
    },
  }, async (request) => ({
    routes: await options.railsInspectionService.getRoutesOverview(
      requireProject(options.projectStore, request.params.projectId),
    ),
  }));

  app.post<{ Params: Params; Body: MutationConfirmationBody }>(
    '/projects/:projectId/rails/migrations/confirmations',
    {
      schema: {
        params: paramsSchema,
        body: mutationConfirmationBodySchema,
        response: {
          201: {
            type: 'object', additionalProperties: false, required: ['confirmation'],
            properties: { confirmation: railsMigrationMutationConfirmationResponseSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      const project = requireProject(options.projectStore, request.params.projectId);
      try {
        return reply.code(201).send({
          confirmation: await options.railsInspectionService.prepareMutationConfirmation(project, request.body.operation),
        });
      } catch (error) {
        translateMutationError(error);
      }
    },
  );

  app.post<{ Params: Params; Body: MutationBody }>(
    '/projects/:projectId/rails/migrations/mutations',
    {
      schema: {
        params: paramsSchema,
        body: mutationBodySchema,
        response: {
          200: {
            type: 'object', additionalProperties: false, required: ['result'],
            properties: { result: railsMigrationMutationResultResponseSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = requireProject(options.projectStore, request.params.projectId);
      try {
        return {
          result: await options.railsInspectionService.runMutation(project, request.body.operation, request.body.confirmationToken),
        };
      } catch (error) {
        translateMutationError(error);
      }
    },
  );

  app.post<{ Params: Params; Body: GeneratorConfirmationBody }>(
    '/projects/:projectId/rails/generate/confirmations',
    {
      schema: {
        params: paramsSchema,
        body: generatorConfirmationBodySchema,
        response: {
          201: {
            type: 'object', additionalProperties: false, required: ['confirmation'],
            properties: { confirmation: railsGeneratorConfirmationResponseSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      const project = requireProject(options.projectStore, request.params.projectId);
      try {
        return reply.code(201).send({
          confirmation: await options.railsInspectionService.prepareGeneratorConfirmation(
            project,
            request.body.kind,
            request.body.name,
            request.body.fields,
            request.body.database,
          ),
        });
      } catch (error) {
        translateMutationError(error);
      }
    },
  );

  app.post<{ Params: Params; Body: GeneratorMutationBody }>(
    '/projects/:projectId/rails/generate/mutations',
    {
      schema: {
        params: paramsSchema,
        body: generatorMutationBodySchema,
        response: {
          200: {
            type: 'object', additionalProperties: false, required: ['result'],
            properties: { result: railsGeneratorResultResponseSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = requireProject(options.projectStore, request.params.projectId);
      try {
        return {
          result: await options.railsInspectionService.runGenerator(project, request.body.confirmationToken),
        };
      } catch (error) {
        translateMutationError(error);
      }
    },
  );
};
