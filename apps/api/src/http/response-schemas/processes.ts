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
        'compose-build',
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
    composeServiceName: { type: 'string' },
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
    healthCheckPath: { type: 'string' },
    updatedAt: { type: 'string' },
  },
} as const;

export const projectServerHealthResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'projectId',
    'path',
    'pathSource',
    'status',
    'checkedAt',
  ],
  properties: {
    projectId: { type: 'string' },
    path: { type: 'string' },
    pathSource: {
      type: 'string',
      enum: ['configured', 'detected'],
    },
    status: {
      type: 'string',
      enum: ['healthy', 'degraded', 'unavailable'],
    },
    httpStatus: { type: 'integer' },
    latencyMs: { type: 'integer', minimum: 0 },
    checkedAt: { type: 'string' },
    message: { type: 'string' },
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
