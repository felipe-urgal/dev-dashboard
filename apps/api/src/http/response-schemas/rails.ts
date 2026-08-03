export const projectDatabaseEnvironmentResponseSchema = {
  type: 'object', additionalProperties: false,

  required: ['id', 'environment', 'driver', 'passwordConfigured', 'source', 'sourceDetail', 'reachability', 'serviceAvailable', 'runtime', 'dockerServices'],

  properties: {
    id: { type: 'string' }, environment: { type: 'string' }, driver: { type: 'string' },
    host: { type: 'string' }, port: { type: 'integer' }, database: { type: 'string' }, username: { type: 'string' },
    passwordConfigured: { type: 'boolean' }, maskedUrl: { type: 'string' },
    source: { type: 'string', enum: ['rails-database-yml', 'dotenv', 'prisma', 'knex'] },
    sourceDetail: { type: 'string' }, reachability: { type: 'string', enum: ['reachable', 'unreachable', 'unknown'] },

    serviceAvailable: { type: 'boolean' },
    runtime: { type: 'string', enum: ['local', 'docker', 'stopped', 'unknown'] },
    dockerServices: { type: 'array', items: { type: 'string' } },

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

export const databaseSnapshotResponseSchema = {
  type: 'object', additionalProperties: false,
  required: ['id', 'environmentId', 'environment', 'driver', 'database', 'label', 'createdAt', 'sizeBytes'],
  properties: {
    id: { type: 'string' },
    environmentId: { type: 'string' },
    environment: { type: 'string' },
    driver: { type: 'string', enum: ['mysql', 'postgresql'] },
    database: { type: 'string' },
    label: { type: 'string' },
    createdAt: { type: 'string' },
    sizeBytes: { type: 'integer', minimum: 0 },
  },
} as const;

export const databaseSnapshotListResponseSchema = {
  type: 'object', additionalProperties: false,
  required: ['snapshots', 'total', 'retentionLimit', 'supportedEnvironmentIds'],
  properties: {
    snapshots: { type: 'array', items: databaseSnapshotResponseSchema },
    total: { type: 'integer', minimum: 0 },
    retentionLimit: { type: 'integer', minimum: 1 },
    supportedEnvironmentIds: { type: 'array', items: { type: 'string' } },
  },
} as const;

export const databaseSnapshotConfirmationResponseSchema = {
  type: 'object', additionalProperties: false,
  required: ['token', 'snapshotId', 'expiresAt'],
  properties: {
    token: { type: 'string' },
    snapshotId: { type: 'string' },
    expiresAt: { type: 'string' },
  },
} as const;

export const databaseRestoreResultResponseSchema = {
  type: 'object', additionalProperties: false,
  required: ['snapshotId', 'restored'],
  properties: {
    snapshotId: { type: 'string' },
    restored: { type: 'boolean' },
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
  required: ['supported', 'databases', 'migrations'],
  properties: {
    supported: { type: 'boolean' },
    databases: { type: 'array', items: { type: 'string' } },
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
