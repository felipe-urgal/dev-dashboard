export const workspaceResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'name', 'path', 'enabled', 'recursiveScan'],
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    path: { type: 'string' },
    enabled: { type: 'boolean' },
    recursiveScan: { type: 'boolean' },
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
    lastAccessedAt: { type: 'string' },
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
          'docker',
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
        'SCAN_DEPTH_LIMIT_REACHED',
        'SCAN_PROJECT_LIMIT_REACHED',
        'SCAN_TIMEOUT',
      ],
    },
    message: { type: 'string' },
  },
} as const;
