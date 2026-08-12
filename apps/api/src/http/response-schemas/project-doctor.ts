export const projectDiagnosticActionResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['label', 'target'],
  properties: {
    label: { type: 'string' },
    target: {
      type: 'string',
      enum: ['dependencies', 'server', 'database', 'environment'],
    },
  },
} as const;

export const projectDiagnosticCheckResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'category', 'label', 'status', 'summary'],
  properties: {
    id: { type: 'string' },
    category: {
      type: 'string',
      enum: ['project', 'runtime', 'dependencies', 'configuration'],
    },
    label: { type: 'string' },
    status: {
      type: 'string',
      enum: ['passed', 'warning', 'failed', 'skipped'],
    },
    summary: { type: 'string' },
    recommendation: { type: 'string' },
    action: projectDiagnosticActionResponseSchema,
  },
} as const;

export const projectDiagnosticSummaryResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['passed', 'warnings', 'failed', 'skipped'],
  properties: {
    passed: { type: 'integer', minimum: 0 },
    warnings: { type: 'integer', minimum: 0 },
    failed: { type: 'integer', minimum: 0 },
    skipped: { type: 'integer', minimum: 0 },
  },
} as const;

export const projectDiagnosticReportResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId', 'generatedAt', 'overallStatus', 'summary', 'checks'],
  properties: {
    projectId: { type: 'string' },
    generatedAt: { type: 'string' },
    overallStatus: {
      type: 'string',
      enum: ['healthy', 'attention', 'blocked'],
    },
    summary: projectDiagnosticSummaryResponseSchema,
    checks: {
      type: 'array',
      items: projectDiagnosticCheckResponseSchema,
    },
  },
} as const;
