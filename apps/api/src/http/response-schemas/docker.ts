const composeServiceActionSchema = {
  type: 'string',
  enum: ['start', 'stop', 'restart'],
} as const;

export const composeServiceSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'requiresBuild', 'ports', 'dependsOn', 'running'],
  properties: {
    name: { type: 'string' },
    image: { type: 'string' },
    requiresBuild: { type: 'boolean' },
    ports: { type: 'array', items: { type: 'string' } },
    dependsOn: { type: 'array', items: { type: 'string' } },
    running: { type: 'boolean' },
  },
} as const;

export const projectComposeOverviewSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['configured', 'dockerAvailable', 'services'],
  properties: {
    configured: { type: 'boolean' },
    dockerAvailable: { type: 'boolean' },
    composeFile: { type: 'string' },
    services: { type: 'array', items: composeServiceSchema },
  },
} as const;

export const composeServiceConfirmationSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['token', 'serviceName', 'action', 'expiresAt'],
  properties: {
    token: { type: 'string' },
    serviceName: { type: 'string' },
    action: { type: 'string', enum: ['stop', 'restart'] },
    expiresAt: { type: 'string' },
  },
} as const;

export const composeServiceBuildConfirmationSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['token', 'serviceName', 'expiresAt'],
  properties: {
    token: { type: 'string' },
    serviceName: { type: 'string' },
    expiresAt: { type: 'string' },
  },
} as const;

export const composeServiceActionResultSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['serviceName', 'action', 'succeeded'],
  properties: {
    serviceName: { type: 'string' },
    action: composeServiceActionSchema,
    succeeded: { type: 'boolean', const: true },
  },
} as const;

export const composeServiceLogsSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'serviceName', 'content', 'sizeBytes', 'truncated',
    'masked', 'redactionCount', 'readAt',
  ],
  properties: {
    serviceName: { type: 'string' },
    content: { type: 'string' },
    sizeBytes: { type: 'integer' },
    truncated: { type: 'boolean' },
    masked: { type: 'boolean' },
    redactionCount: { type: 'integer', minimum: 0 },
    readAt: { type: 'string' },
  },
} as const;
