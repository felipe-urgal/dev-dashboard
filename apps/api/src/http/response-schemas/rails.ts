export const projectDatabaseEnvironmentResponseSchema = {
  type: 'object', additionalProperties: false,

  required: ['id', 'environment', 'driver', 'passwordConfigured', 'source', 'sourceDetail', 'reachability', 'startAvailable'],

  properties: {
    id: { type: 'string' }, environment: { type: 'string' }, driver: { type: 'string' },
    host: { type: 'string' }, port: { type: 'integer' }, database: { type: 'string' }, username: { type: 'string' },
    passwordConfigured: { type: 'boolean' }, maskedUrl: { type: 'string' },
    source: { type: 'string', enum: ['rails-database-yml', 'dotenv', 'prisma', 'knex'] },
    sourceDetail: { type: 'string' }, reachability: { type: 'string', enum: ['reachable', 'unreachable', 'unknown'] },

    startAvailable: { type: 'boolean' },

  },
} as const;

export const projectDatabaseOverviewResponseSchema = {
  type: 'object', additionalProperties: false,
  required: ['supported', 'environments', 'page', 'pageSize', 'total'],
  properties: {
    supported: { type: 'boolean' }, environments: { type: 'array', items: projectDatabaseEnvironmentResponseSchema },
    page: { type: 'integer' }, pageSize: { type: 'integer' }, total: { type: 'integer' },
  },
} as const;

export const railsMigrationEntryResponseSchema = {
  type: 'object', additionalProperties: false,
  required: ['version', 'name', 'status'],
  properties: {
    version: { type: 'string' }, name: { type: 'string' },
    status: { type: 'string', enum: ['up', 'down'] },
  },
} as const;

export const railsMigrationsOverviewResponseSchema = {
  type: 'object', additionalProperties: false,
  required: ['supported', 'migrations'],
  properties: {
    supported: { type: 'boolean' },
    database: { type: 'string' },
    migrations: { type: 'array', items: railsMigrationEntryResponseSchema },
  },
} as const;

export const railsRouteEntryResponseSchema = {
  type: 'object', additionalProperties: false,
  required: ['verb', 'path', 'controllerAction'],
  properties: {
    name: { type: 'string' }, verb: { type: 'string' },
    path: { type: 'string' }, controllerAction: { type: 'string' },
  },
} as const;

export const railsRoutesOverviewResponseSchema = {
  type: 'object', additionalProperties: false,
  required: ['supported', 'routes'],
  properties: {
    supported: { type: 'boolean' },
    routes: { type: 'array', items: railsRouteEntryResponseSchema },
  },
} as const;

export const bundlerOutdatedGemResponseSchema = {
  type: 'object', additionalProperties: false,
  required: ['name', 'installed', 'newest'],
  properties: {
    name: { type: 'string' }, installed: { type: 'string' }, newest: { type: 'string' },
    requested: { type: 'string' },
  },
} as const;

export const bundlerOverviewResponseSchema = {
  type: 'object', additionalProperties: false,
  required: ['supported', 'outdated'],
  properties: {
    supported: { type: 'boolean' },
    check: {
      type: 'object', additionalProperties: false, required: ['satisfied', 'message'],
      properties: { satisfied: { type: 'boolean' }, message: { type: 'string' } },
    },
    outdated: { type: 'array', items: bundlerOutdatedGemResponseSchema },
  },
} as const;

export const railsMigrationMutationConfirmationResponseSchema = {
  type: 'object', additionalProperties: false,
  required: ['token', 'operation', 'expiresAt'],
  properties: {
    token: { type: 'string' },
    operation: { type: 'string', enum: ['migrate', 'rollback', 'seed', 'prepare'] },
    expiresAt: { type: 'string' },
  },
} as const;

export const railsMigrationMutationResultResponseSchema = {
  type: 'object', additionalProperties: false,
  required: ['operation', 'succeeded', 'output', 'truncated', 'masked', 'redactionCount'],
  properties: {
    operation: { type: 'string', enum: ['migrate', 'rollback', 'seed', 'prepare'] },
    succeeded: { type: 'boolean' },
    output: { type: 'string' },
    truncated: { type: 'boolean' },
    masked: { type: 'boolean' },
    redactionCount: { type: 'integer', minimum: 0 },
  },
} as const;
