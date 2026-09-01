const commandIdSchema = {
  type: 'string',
  enum: [
    'status',
    'check',
    'backup',
    'migrate',
    'deploy',
    'verify',
    'restoreCheck',
    'rollback',
    'logs',
  ],
} as const;

const stepIdSchema = {
  type: 'string',
  enum: [
    'status',
    'check',
    'backup',
    'migrate',
    'deploy',
    'verify',
    'restoreCheck',
    'rollback',
    'logs',
    'provider-deploy',
  ],
} as const;

const scriptIdSchema = {
  type: 'string',
  enum: [
    'prod:status',
    'prod:check',
    'prod:backup',
    'prod:migrate',
    'prod:deploy',
    'prod:verify',
    'prod:restore-check',
    'prod:rollback',
    'prod:logs',
  ],
} as const;

const phaseSchema = {
  type: 'string',
  enum: ['preparing', 'backing_up', 'migrating', 'deploying', 'verifying'],
} as const;

const stepStatusSchema = {
  type: 'string',
  enum: ['pending', 'running', 'succeeded', 'failed', 'cancelled'],
} as const;

const providerSchema = {
  type: 'string',
  enum: ['systemd', 'docker-compose', 'vercel', 'none'],
} as const;

const providerTargetSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['externalProject', 'branch', 'revision'],
  properties: {
    externalProject: { type: 'string', minLength: 1 },
    branch: { type: 'string', minLength: 1 },
    revision: { type: 'string', pattern: '^[0-9a-fA-F]{40}$' },
  },
} as const;

const commandPlanStepResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'script', 'phase', 'mutating', 'irreversible'],
  properties: {
    id: commandIdSchema,
    script: scriptIdSchema,
    phase: phaseSchema,
    mutating: { type: 'boolean' },
    irreversible: { type: 'boolean' },
    providerPreflight: providerTargetSchema,
  },
} as const;

const providerPlanStepResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'phase', 'mutating', 'irreversible', 'target'],
  properties: {
    id: { type: 'string', enum: ['provider-deploy'] },
    phase: { type: 'string', enum: ['deploying'] },
    mutating: { type: 'boolean', const: true },
    irreversible: { type: 'boolean', const: true },
    target: providerTargetSchema,
  },
} as const;

export const deploymentPlanStepResponseSchema = {
  oneOf: [commandPlanStepResponseSchema, providerPlanStepResponseSchema],
} as const;

export const deploymentPlanResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'projectId',
    'projectName',
    'provider',
    'branch',
    'revision',
    'planHash',
    'createdAt',
    'steps',
  ],
  properties: {
    projectId: { type: 'string' },
    projectName: { type: 'string' },
    provider: providerSchema,
    branch: { type: 'string' },
    revision: { type: 'string' },
    planHash: { type: 'string', pattern: '^[0-9a-f]{64}$' },
    createdAt: { type: 'string' },
    steps: { type: 'array', items: deploymentPlanStepResponseSchema },
  },
} as const;

export const deploymentConfirmationResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['token', 'projectId', 'revision', 'planHash', 'expiresAt'],
  properties: {
    token: { type: 'string', pattern: '^[0-9a-f]{64}$' },
    projectId: { type: 'string' },
    revision: { type: 'string' },
    planHash: { type: 'string', pattern: '^[0-9a-f]{64}$' },
    expiresAt: { type: 'string' },
  },
} as const;

const commandTimelineStepResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'script', 'phase', 'mutating', 'irreversible', 'status'],
  properties: {
    ...commandPlanStepResponseSchema.properties,
    status: stepStatusSchema,
    startedAt: { type: 'string' },
    finishedAt: { type: 'string' },
    exitCode: { type: 'integer' },
  },
} as const;

const providerExecutionTimelineStepResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'phase', 'mutating', 'irreversible', 'target', 'status'],
  properties: {
    ...providerPlanStepResponseSchema.properties,
    status: stepStatusSchema,
    startedAt: { type: 'string' },
    finishedAt: { type: 'string' },
    exitCode: { type: 'integer' },
  },
} as const;

export const deploymentTimelineStepResponseSchema = {
  oneOf: [
    commandTimelineStepResponseSchema,
    providerExecutionTimelineStepResponseSchema,
  ],
} as const;

export const deploymentResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'projectId',
    'projectName',
    'provider',
    'branch',
    'revision',
    'planHash',
    'status',
    'createdAt',
    'timeline',
  ],
  properties: {
    id: { type: 'string' },
    projectId: { type: 'string' },
    projectName: { type: 'string' },
    provider: providerSchema,
    branch: { type: 'string' },
    revision: { type: 'string' },
    planHash: { type: 'string', pattern: '^[0-9a-f]{64}$' },
    status: {
      type: 'string',
      enum: [
        'planned',
        'preparing',
        'backing_up',
        'migrating',
        'deploying',
        'verifying',
        'succeeded',
        'failed',
        'recovery_required',
        'cancelled',
      ],
    },
    createdAt: { type: 'string' },
    startedAt: { type: 'string' },
    finishedAt: { type: 'string' },
    currentStepId: stepIdSchema,
    failurePoint: {
      type: 'string',
      enum: ['before-irreversible', 'after-irreversible'],
    },
    errorCode: { type: 'string' },
    errorMessage: { type: 'string' },
    timeline: { type: 'array', items: deploymentTimelineStepResponseSchema },
  },
} as const;

export const deploymentHistoryResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['items', 'page', 'pageSize', 'total'],
  properties: {
    items: { type: 'array', items: deploymentResponseSchema },
    page: { type: 'integer', minimum: 1 },
    pageSize: { type: 'integer', minimum: 1 },
    total: { type: 'integer', minimum: 0 },
  },
} as const;

export const deploymentLogResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'deploymentId',
    'content',
    'truncated',
    'masked',
    'redactionCount',
  ],
  properties: {
    deploymentId: { type: 'string' },
    content: { type: 'string' },
    truncated: { type: 'boolean' },
    masked: { type: 'boolean' },
    redactionCount: { type: 'integer', minimum: 0 },
  },
} as const;

const providerTimelineStepResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'phase', 'status'],
  properties: {
    id: { type: 'string', enum: ['provider-deploy'] },
    phase: { type: 'string', enum: ['deploying'] },
    status: stepStatusSchema,
    startedAt: { type: 'string' },
    finishedAt: { type: 'string' },
  },
} as const;

const providerSnapshotResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'url', 'state', 'createdAt'],
  properties: {
    id: { type: 'string' },
    url: { type: 'string' },
    state: {
      type: 'string',
      enum: ['queued', 'building', 'ready', 'error', 'cancelled', 'unknown'],
    },
    createdAt: { type: 'string' },
    branch: { type: 'string' },
    revision: { type: 'string', pattern: '^[0-9a-fA-F]{40}$' },
  },
} as const;

export const productionDeploymentStatusResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'projectId',
    'projectName',
    'strategy',
    'provider',
    'branch',
    'externalProject',
    'providerAvailability',
    'drift',
    'localOperations',
    'timeline',
  ],
  properties: {
    projectId: { type: 'string' },
    projectName: { type: 'string' },
    strategy: { type: 'string', enum: ['git-managed'] },
    provider: { type: 'string', enum: ['vercel'] },
    branch: { type: 'string' },
    externalProject: { type: 'string' },
    providerAvailability: {
      type: 'string',
      enum: [
        'available',
        'not-configured',
        'auth-error',
        'quota-limited',
        'project-not-found',
        'unavailable',
        'invalid-response',
      ],
    },
    originRevision: { type: 'string', pattern: '^[0-9a-fA-F]{40}$' },
    productionRevision: { type: 'string', pattern: '^[0-9a-fA-F]{40}$' },
    drift: { type: 'string', enum: ['in-sync', 'drift', 'unknown'] },
    localOperations: { type: 'array', items: commandIdSchema },
    providerProjectId: { type: 'string' },
    providerProjectName: { type: 'string' },
    deployment: providerSnapshotResponseSchema,
    timeline: { type: 'array', items: providerTimelineStepResponseSchema },
    errorCode: {
      type: 'string',
      enum: [
        'DEPLOYMENT_PROVIDER_INTEGRATION_UNAVAILABLE',
        'DEPLOYMENT_PROVIDER_AUTH_FAILED',
        'DEPLOYMENT_PROVIDER_QUOTA_EXCEEDED',
        'DEPLOYMENT_PROVIDER_PROJECT_NOT_FOUND',
        'DEPLOYMENT_PROVIDER_UNAVAILABLE',
        'DEPLOYMENT_PROVIDER_RESPONSE_INVALID',
      ],
    },
    errorMessage: { type: 'string' },
  },
} as const;
