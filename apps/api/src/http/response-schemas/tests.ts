export const projectTestCommandResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'runner', 'label', 'description', 'origin', 'priority', 'supportsFileTarget'],
  properties: {
    id: { type: 'string' },
    runner: {
      type: 'string',
      enum: ['vitest', 'jest', 'node-test', 'rspec', 'rails-test', 'minitest', 'pytest'],
    },
    label: { type: 'string' },
    description: { type: 'string' },
    origin: {
      type: 'string',
      enum: ['package-script', 'binary', 'gemfile', 'directory', 'python-config'],
    },
    originDetail: { type: 'string' },
    priority: { type: 'integer' },
    supportsFileTarget: { type: 'boolean' },
  },
} as const;

export const projectTestFileResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['path'],
  properties: {
    path: { type: 'string' },
  },
} as const;

export const testExecutionRecordResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'projectId', 'commandId', 'status', 'startedAt'],
  properties: {
    id: { type: 'string' },
    projectId: { type: 'string' },
    commandId: { type: 'string' },
    targetFile: { type: 'string' },
    status: { type: 'string', enum: ['starting', 'running', 'stopping', 'stopped', 'failed'] },
    startedAt: { type: 'string' },
    finishedAt: { type: 'string' },
    exitCode: { type: 'integer' },
  },
} as const;

export const testExecutionHistoryResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['items', 'page', 'pageSize', 'total', 'totalPages'],
  properties: {
    items: { type: 'array', items: testExecutionRecordResponseSchema },
    page: { type: 'integer' },
    pageSize: { type: 'integer' },
    total: { type: 'integer' },
    totalPages: { type: 'integer' },
  },
} as const;

export const testExecutionHistoryClearResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['removedCount'],
  properties: {
    removedCount: { type: 'integer', minimum: 0 },
  },
} as const;

export const projectTestOverviewResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['supported', 'commands'],
  properties: {
    supported: { type: 'boolean' },
    commands: {
      type: 'array',
      items: projectTestCommandResponseSchema,
    },
  },
} as const;
