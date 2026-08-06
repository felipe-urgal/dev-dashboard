import type {
  RailsGeneratorFieldType,
  RailsMigrationMutationOperation,
} from '@dev-dashboard/contracts';

export const MUTATION_CONFIRMATION_TTL_MS = 60_000;
export const MUTATION_OUTPUT_LIMIT = 262_144;
export const MIGRATION_SOURCE_LIMIT = 262_144;

export const MUTATION_ARGS: Record<RailsMigrationMutationOperation, string[]> =
  {
    migrate: ['db:migrate'],
    rollback: ['db:rollback', 'STEP=1'],
    seed: ['db:seed'],
    prepare: ['db:prepare'],
  };

// Catálogo fechado: só os tipos que o Rails aceita nativamente em `t.<tipo>` no schema.
export const GENERATOR_FIELD_TYPES: readonly RailsGeneratorFieldType[] = [
  'string',
  'text',
  'integer',
  'bigint',
  'float',
  'decimal',
  'boolean',
  'date',
  'datetime',
  'time',
  'timestamp',
  'binary',
  'references',
  'uuid',
];
export const GENERATOR_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;
export const GENERATOR_FIELD_NAME_PATTERN = /^[a-z][a-z0-9_]*$/;
export const GENERATOR_MAX_FIELDS = 25;
export const GENERATOR_CONFIRMATION_TTL_MS = 60_000;
