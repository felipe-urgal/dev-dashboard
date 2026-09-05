const coverageMetricSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['total', 'covered', 'pct'],
  properties: {
    total: { type: 'integer', minimum: 0 },
    covered: { type: 'integer', minimum: 0 },
    pct: { type: 'number', minimum: 0, maximum: 100 },
  },
} as const;

const coverageTotalsProperties = {
  statements: coverageMetricSchema,
  branches: coverageMetricSchema,
  functions: coverageMetricSchema,
  lines: coverageMetricSchema,
} as const;

const coverageTotalsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['statements', 'branches', 'functions', 'lines'],
  properties: coverageTotalsProperties,
} as const;

const coverageFileSummarySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['path', 'statements', 'branches', 'functions', 'lines'],
  properties: {
    path: { type: 'string' },
    ...coverageTotalsProperties,
  },
} as const;

export const projectCoverageSummaryResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['available'],
  properties: {
    available: { type: 'boolean' },
    generatedAt: { type: 'string' },
    total: coverageTotalsSchema,
    files: { type: 'array', items: coverageFileSummarySchema },
  },
} as const;

const coverageHistoryEntrySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'generatedAt', 'recordedAt', 'total'],
  properties: {
    id: { type: 'string' },
    generatedAt: { type: 'string' },
    recordedAt: { type: 'string' },
    total: coverageTotalsSchema,
    files: { type: 'array', items: coverageFileSummarySchema },
    gitRevision: { type: 'string' },
    gitDirtyFingerprint: { type: 'string' },
    environmentInstanceId: { type: 'string' },
  },
} as const;

export const projectCoverageHistoryResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['items', 'total'],
  properties: {
    items: { type: 'array', items: coverageHistoryEntrySchema },
    total: { type: 'integer', minimum: 0 },
  },
} as const;
