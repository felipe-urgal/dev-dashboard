export const releaseReadinessActionResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['label', 'target'],
  properties: {
    label: { type: 'string' },
    target: {
      type: 'string',
      enum: ['synchronization', 'tests', 'doctor', 'migrations'],
    },
  },
} as const;

export const releaseReadinessCheckResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'state', 'summary', 'evidence', 'observedAt', 'action'],
  properties: {
    id: { type: 'string', enum: ['git', 'tests', 'doctor', 'migrations'] },
    state: {
      type: 'string',
      enum: ['pass', 'warning', 'block', 'unknown'],
    },
    summary: { type: 'string' },
    evidence: { type: 'string' },
    observedAt: { type: 'string' },
    action: releaseReadinessActionResponseSchema,
  },
} as const;

export const releaseReadinessSnapshotResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['state', 'generatedAt', 'checks'],
  properties: {
    state: {
      type: 'string',
      enum: ['pass', 'warning', 'block', 'unknown'],
    },
    generatedAt: { type: 'string' },
    checks: {
      type: 'array',
      items: releaseReadinessCheckResponseSchema,
    },
  },
} as const;
