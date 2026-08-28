export const machineDatabaseServiceResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'driver', 'label', 'unit', 'installed', 'active'],
  properties: {
    id: { type: 'string' },
    driver: {
      type: 'string',
      enum: ['mysql', 'mariadb', 'postgresql', 'redis', 'mongodb'],
    },
    label: { type: 'string' },
    unit: { type: 'string' },
    installed: { type: 'boolean' },
    active: { type: 'boolean' },
  },
} as const;

export const machineDatabaseServiceDetailsResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['serviceId', 'reachability', 'logs'],
  properties: {
    serviceId: { type: 'string' },
    port: { type: 'integer', minimum: 1, maximum: 65535 },
    version: { type: 'string' },
    pid: { type: 'integer', minimum: 1 },
    startedAt: { type: 'string' },
    reachability: {
      type: 'string',
      enum: ['reachable', 'unreachable', 'unknown'],
    },
    logs: { type: 'array', items: { type: 'string' } },
  },
} as const;

export const machineDatabaseCatalogItemResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['name'],
  properties: {
    name: { type: 'string' },
  },
} as const;

export const machineDatabaseTableResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['name'],
  properties: {
    name: { type: 'string' },
    schema: { type: 'string' },
  },
} as const;

export const machineDatabaseQueryResultResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['columns', 'rows', 'rowCount', 'truncated'],
  properties: {
    columns: { type: 'array', items: { type: 'string' } },
    rows: {
      type: 'array',
      items: {
        type: 'array',
        items: {},
      },
    },
    rowCount: { type: 'integer', minimum: 0 },
    truncated: { type: 'boolean' },
  },
} as const;
