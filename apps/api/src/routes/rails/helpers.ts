import type { RailsGeneratorField, RailsGeneratorKind, RailsMigrationMutationOperation, RailsWorkerId } from '@dev-dashboard/contracts';
import { ProcessManagerError } from '@dev-dashboard/process-manager';

import { ApiError } from '../../http/api-error.js';
import { RailsMutationError, type RailsInspectionService } from '../../services/rails-inspection-service.js';
import { RailsWorkerError, type RailsRuntimeService } from '../../services/rails-runtime-service.js';
import type { ProjectStore } from '../../store/project-store.js';

export interface RailsRouteOptions {
  projectStore: ProjectStore;
  railsInspectionService: RailsInspectionService;
  railsRuntimeService: RailsRuntimeService;
}

export interface Params {
  projectId: string;
}

export interface MigrationParams extends Params {
  version: string;
}

export interface DatabaseQuery {
  database?: string;
}

export interface MutationConfirmationBody {
  operation: RailsMigrationMutationOperation;
}

export interface MutationBody {
  operation: RailsMigrationMutationOperation;
  confirmationToken: string;
}

export interface GeneratorConfirmationBody {
  kind: RailsGeneratorKind;
  name: string;
  fields: RailsGeneratorField[];
  database?: string;
}

export interface GeneratorMutationBody {
  confirmationToken: string;
}

export const paramsSchema = {
  type: 'object', additionalProperties: false, required: ['projectId'],
  properties: { projectId: { type: 'string', minLength: 1 } },
} as const;

export const migrationParamsSchema = {
  type: 'object', additionalProperties: false, required: ['projectId', 'version'],
  properties: {
    projectId: { type: 'string', minLength: 1 },
    version: { type: 'string', pattern: '^[0-9]{8,20}$' },
  },
} as const;

export const databaseQuerySchema = {
  type: 'object', additionalProperties: false,
  properties: { database: { type: 'string', pattern: '^[a-z][a-z0-9_]*$', maxLength: 60 } },
} as const;

const mutationOperationEnum = ['migrate', 'rollback', 'seed', 'prepare'] as const;

export const mutationConfirmationBodySchema = {
  type: 'object', additionalProperties: false, required: ['operation'],
  properties: { operation: { type: 'string', enum: mutationOperationEnum } },
} as const;

export const mutationBodySchema = {
  type: 'object', additionalProperties: false, required: ['operation', 'confirmationToken'],
  properties: {
    operation: { type: 'string', enum: mutationOperationEnum },
    confirmationToken: { type: 'string', minLength: 64, maxLength: 64 },
  },
} as const;

export const railsMigrationDetailResponseSchema = {
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

export const railsModelsOverviewResponseSchema = {
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

export const generatorConfirmationBodySchema = {
  type: 'object', additionalProperties: false, required: ['kind', 'name', 'fields'],
  properties: {
    kind: { type: 'string', enum: generatorKindEnum },
    name: { type: 'string', minLength: 1, maxLength: 60 },
    fields: { type: 'array', maxItems: 25, items: generatorFieldSchema },
    database: { type: 'string', pattern: '^[a-z][a-z0-9_]*$', maxLength: 60 },
  },
} as const;

export const generatorMutationBodySchema = {
  type: 'object', additionalProperties: false, required: ['confirmationToken'],
  properties: { confirmationToken: { type: 'string', minLength: 64, maxLength: 64 } },
} as const;

export const railsGeneratorConfirmationResponseSchema = {
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

export const railsGeneratorResultResponseSchema = {
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

export interface WorkerParams extends Params {
  workerId: RailsWorkerId;
}

export interface WorkerLogQuery {
  maxBytes?: number;
}

export const workerParamsSchema = {
  type: 'object', additionalProperties: false, required: ['projectId', 'workerId'],
  properties: {
    projectId: { type: 'string', minLength: 1 },
    workerId: { type: 'string', enum: ['sidekiq', 'webpack'] },
  },
} as const;

export const workerLogQuerySchema = {
  type: 'object', additionalProperties: false,
  properties: { maxBytes: { type: 'integer', minimum: 1, maximum: 262_144 } },
} as const;

export function requireProject(store: ProjectStore, id: string) {
  const project = store.findProject(id);
  if (!project) throw new ApiError({ statusCode: 404, code: 'PROJECT_NOT_FOUND', message: 'Projeto não encontrado.' });
  return project;
}

export function translateWorkerError(error: unknown): never {
  if (error instanceof RailsWorkerError) {
    throw new ApiError({ statusCode: 409, code: error.code, message: error.message });
  }
  if (error instanceof ProcessManagerError) {
    const statuses: Record<string, number> = {
      PROCESS_NOT_FOUND: 404,
      PROCESS_ALREADY_RUNNING: 409,
      PROCESS_IDENTITY_MISMATCH: 409,
      PROCESS_STOP_TIMEOUT: 409,
    };
    throw new ApiError({ statusCode: statuses[error.code] ?? 400, code: error.code, message: error.message });
  }
  throw new ApiError({
    statusCode: 500, code: 'RAILS_MUTATION_FAILED',
    message: error instanceof Error ? error.message : 'Não foi possível concluir a operação do worker.',
  });
}

export function translateMutationError(error: unknown): never {
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
