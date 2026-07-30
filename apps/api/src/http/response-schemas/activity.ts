const activityStatusEnum = ['running', 'succeeded', 'failed', 'cancelled', 'unknown'] as const;

const scriptActivityResponseSchema = {
  type: 'object', additionalProperties: false,
  required: ['id', 'projectId', 'label', 'origin', 'status', 'startedAt', 'reference'],
  properties: {
    id: { type: 'string' }, projectId: { type: 'string' }, workspaceId: { type: 'string' },
    label: { type: 'string' }, origin: { type: 'string', enum: ['script'] },
    status: { type: 'string', enum: activityStatusEnum },
    startedAt: { type: 'string' }, finishedAt: { type: 'string' },
    reference: {
      type: 'object', additionalProperties: false, required: ['executionId', 'actionId'],
      properties: { executionId: { type: 'string' }, actionId: { type: 'string' } },
    },
  },
} as const;

const processActivityResponseSchema = (origin: 'test' | 'server') => ({
  type: 'object', additionalProperties: false,
  required: ['id', 'projectId', 'label', 'origin', 'status', 'startedAt', 'reference'],
  properties: {
    id: { type: 'string' }, projectId: { type: 'string' }, workspaceId: { type: 'string' },
    label: { type: 'string' }, origin: { type: 'string', enum: [origin] },
    status: { type: 'string', enum: activityStatusEnum },
    startedAt: { type: 'string' }, finishedAt: { type: 'string' },
    reference: {
      type: 'object', additionalProperties: false, required: ['processId'],
      properties: { processId: { type: 'string' } },
    },
  },
}) as const;

export const activityListResponseSchema = {
  type: 'object', additionalProperties: false,
  required: ['items', 'page', 'pageSize', 'total', 'totalPages', 'summary'],
  properties: {
    items: {
      type: 'array',
      items: {
        anyOf: [
          scriptActivityResponseSchema,
          processActivityResponseSchema('test'),
          processActivityResponseSchema('server'),
        ],
      },
    },
    page: { type: 'integer' }, pageSize: { type: 'integer' },
    total: { type: 'integer' }, totalPages: { type: 'integer' },
    summary: {
      type: 'object',
      additionalProperties: false,
      required: ['running', 'succeeded', 'failed', 'total'],
      properties: {
        running: { type: 'integer', minimum: 0 },
        succeeded: { type: 'integer', minimum: 0 },
        failed: { type: 'integer', minimum: 0 },
        total: { type: 'integer', minimum: 0 },
      },
    },
  },
} as const;
