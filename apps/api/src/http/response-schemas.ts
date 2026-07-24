export const apiErrorDetailsResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['message'],
  properties: {
    path: {
      type: 'string',
    },
    message: {
      type: 'string',
    },
  },
} as const;

export const apiErrorResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['error', 'message'],
  properties: {
    error: {
      type: 'string',
    },
    message: {
      type: 'string',
    },
    details: {
      type: 'array',
      items: apiErrorDetailsResponseSchema,
    },
  },
} as const;

export const commonErrorResponseSchemas = {
  400: apiErrorResponseSchema,
  401: apiErrorResponseSchema,
  403: apiErrorResponseSchema,
  404: apiErrorResponseSchema,
  409: apiErrorResponseSchema,
  500: apiErrorResponseSchema,
} as const;

export const workspaceResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'name', 'path', 'enabled'],
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    path: { type: 'string' },
    enabled: { type: 'boolean' },
  },
} as const;

export const projectResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'name',
    'path',
    'type',
    'source',
    'favorite',
    'capabilities',
  ],
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    path: { type: 'string' },
    type: {
      type: 'string',
      enum: ['rails', 'node', 'unknown'],
    },
    source: {
      type: 'string',
      enum: ['workspace', 'standalone'],
    },
    workspaceId: { type: 'string' },
    port: { type: 'integer' },
    favorite: { type: 'boolean' },
    capabilities: {
      type: 'array',
      items: {
        type: 'string',
        enum: [
          'server',
          'git',
          'tests',
          'database',
          'scripts',
          'webpack',
          'sidekiq',
          'rake',
          'bundler',
        ],
      },
    },
  },
} as const;

export const workspaceScanWarningResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['path', 'code', 'message'],
  properties: {
    path: { type: 'string' },
    code: {
      type: 'string',
      enum: [
        'UNREADABLE_DIRECTORY',
        'PROJECT_DETECTION_FAILED',
      ],
    },
    message: { type: 'string' },
  },
} as const;

export const managedProcessResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'projectId', 'kind', 'status'],
  properties: {
    id: { type: 'string' },
    projectId: { type: 'string' },
    workspaceId: { type: 'string' },
    kind: {
      type: 'string',
      enum: [
        'server',
        'webpack',
        'worker',
        'test',
        'script',
      ],
    },
    status: {
      type: 'string',
      enum: [
        'starting',
        'running',
        'stopping',
        'stopped',
        'failed',
      ],
    },
    pid: { type: 'integer' },
    port: { type: 'integer' },
    url: { type: 'string' },
    urls: {
      type: 'array',
      items: { type: 'string' },
    },
    command: { type: 'string' },
    args: {
      type: 'array',
      items: { type: 'string' },
    },
    startedAt: { type: 'string' },
    stoppedAt: { type: 'string' },
    exitCode: { type: 'integer' },
  },
} as const;

export const nullableManagedProcessResponseSchema = {
  ...managedProcessResponseSchema,
  type: ['object', 'null'],
} as const;

export const processLogSnapshotResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'projectId',
    'processId',
    'content',
    'sizeBytes',
    'truncated',
    'readAt',
  ],
  properties: {
    projectId: { type: 'string' },
    processId: { type: 'string' },
    content: { type: 'string' },
    sizeBytes: { type: 'integer' },
    truncated: { type: 'boolean' },
    updatedAt: { type: 'string' },
    readAt: { type: 'string' },
  },
} as const;

export const projectServerSettingsResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId'],
  properties: {
    projectId: { type: 'string' },
    port: { type: 'integer' },
    updatedAt: { type: 'string' },
  },
} as const;

export const logRetentionSweepResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['removed', 'removedCount'],
  properties: {
    removed: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['projectId'],
        properties: {
          projectId: { type: 'string' },
        },
      },
    },
    removedCount: {
      type: 'integer',
      minimum: 0,
    },
  },
} as const;
