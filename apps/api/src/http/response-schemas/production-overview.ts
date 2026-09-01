const productionOverviewStateSchema = {
  type: 'string',
  enum: [
    'in-sync',
    'drift',
    'running',
    'failed',
    'recovery-required',
    'not-configured',
    'blocked',
    'unknown',
  ],
} as const;

const productionOverviewHealthSchema = {
  type: 'string',
  enum: ['verified', 'verify-failed', 'unknown', 'not-configured'],
} as const;

const productionStrategySchema = {
  type: 'string',
  enum: ['command', 'git-managed', 'disabled'],
} as const;

const productionProviderSchema = {
  type: 'string',
  enum: ['systemd', 'docker-compose', 'vercel', 'none'],
} as const;

const providerAvailabilitySchema = {
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
} as const;

const deploymentStatusSchema = {
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
} as const;

const revisionSchema = {
  type: 'string',
  pattern: '^[0-9a-fA-F]{40}$',
} as const;

const productionOverviewItemResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId', 'projectName', 'state', 'health'],
  properties: {
    projectId: { type: 'string', minLength: 1 },
    projectName: { type: 'string', minLength: 1 },
    workspaceId: { type: 'string', minLength: 1 },
    state: productionOverviewStateSchema,
    health: productionOverviewHealthSchema,
    strategy: productionStrategySchema,
    provider: productionProviderSchema,
    branch: { type: 'string', minLength: 1 },
    targetRevision: revisionSchema,
    originRevision: revisionSchema,
    productionRevision: revisionSchema,
    providerAvailability: providerAvailabilitySchema,
    deploymentId: { type: 'string', minLength: 1 },
    deploymentStatus: deploymentStatusSchema,
    healthCheckedAt: { type: 'string', minLength: 1 },
    errorCode: { type: 'string', minLength: 1 },
    errorMessage: { type: 'string', minLength: 1 },
  },
} as const;

export const productionOverviewResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['generatedAt', 'items'],
  properties: {
    generatedAt: { type: 'string', minLength: 1 },
    items: {
      type: 'array',
      items: productionOverviewItemResponseSchema,
    },
  },
} as const;
