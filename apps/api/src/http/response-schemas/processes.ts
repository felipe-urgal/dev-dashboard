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
    'masked',
    'redactionCount',
    'readAt',
  ],
  properties: {
    projectId: { type: 'string' },
    processId: { type: 'string' },
    content: { type: 'string' },
    sizeBytes: { type: 'integer' },
    truncated: { type: 'boolean' },
    masked: { type: 'boolean' },
    redactionCount: { type: 'integer', minimum: 0 },
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
        properties: {
          projectId: { type: 'string' },
          logFile: { type: 'string' },
        },
      },
    },
    removedCount: {
      type: 'integer',
      minimum: 0,
    },
  },
} as const;
