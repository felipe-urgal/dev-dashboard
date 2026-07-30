export const projectScriptCatalogResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['items', 'page', 'pageSize', 'total', 'totalPages'],
  properties: {
    items: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'name', 'description', 'command', 'origin', 'risk', 'enabled'], properties: {
      id: { type: 'string' }, name: { type: 'string' }, description: { type: 'string' }, command: { type: 'string' },
      origin: { type: 'string', enum: ['package-script', 'rails-task', 'bin'] },
      risk: { type: 'string', enum: ['read-only', 'mutable', 'destructive'] }, enabled: { type: 'boolean' },
    } } },
    page: { type: 'integer' }, pageSize: { type: 'integer' }, total: { type: 'integer' }, totalPages: { type: 'integer' },
  },
} as const;

export const scriptExecutionResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'projectId', 'actionId', 'actionName', 'risk', 'status', 'startedAt'],
  properties: {
    id: { type: 'string' },
    projectId: { type: 'string' },
    actionId: { type: 'string' },
    actionName: { type: 'string' },
    risk: { type: 'string', enum: ['read-only', 'mutable', 'destructive'] },
    status: { type: 'string', enum: ['running', 'succeeded', 'failed', 'cancelled'] },
    startedAt: { type: 'string' },
    finishedAt: { type: 'string' },
    exitCode: { type: 'integer' },
  },
} as const;

export const latestScriptExecutionResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['execution'],
  properties: {
    execution: {
      anyOf: [scriptExecutionResponseSchema, { type: 'null' }],
    },
  },
} as const;

export const scriptExecutionHistoryResponseSchema = {
  type: 'object', additionalProperties: false,
  required: ['items', 'page', 'pageSize', 'total', 'totalPages'],
  properties: {
    items: { type: 'array', items: scriptExecutionResponseSchema },
    page: { type: 'integer' }, pageSize: { type: 'integer' }, total: { type: 'integer' }, totalPages: { type: 'integer' },
  },
} as const;

export const scriptExecutionLogResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['executionId', 'content', 'truncated', 'masked', 'redactionCount'],
  properties: {
    executionId: { type: 'string' },
    content: { type: 'string' },
    truncated: { type: 'boolean' },
    masked: { type: 'boolean' },
    redactionCount: { type: 'integer', minimum: 0 },
  },
} as const;

export const scriptExecutionConfirmationResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['token', 'actionId', 'expiresAt'],
  properties: {
    token: { type: 'string' },
    actionId: { type: 'string' },
    expiresAt: { type: 'string' },
  },
} as const;
