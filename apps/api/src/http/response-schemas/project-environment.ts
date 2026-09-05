const projectEnvironmentVariableResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'sensitive'],
  properties: {
    name: { type: 'string' },
    value: { type: 'string' },
    sensitive: { type: 'boolean' },
  },
} as const;

const projectEnvironmentFileResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['file', 'variables'],
  properties: {
    file: { type: 'string' },
    variables: {
      type: 'array',
      items: projectEnvironmentVariableResponseSchema,
    },
  },
} as const;

export const projectEnvironmentOverviewResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['files'],
  properties: {
    files: { type: 'array', items: projectEnvironmentFileResponseSchema },
  },
} as const;

export const projectEnvironmentVariableValueResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['file', 'name', 'value', 'sensitive'],
  properties: {
    file: { type: 'string' },
    name: { type: 'string' },
    value: { type: 'string' },
    sensitive: { type: 'boolean' },
  },
} as const;

const projectEnvironmentContractVariableResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'name',
    'sensitive',
    'status',
    'baseline',
    'sources',
    'required',
    'suggestedAction',
  ],
  properties: {
    name: { type: 'string' },
    sensitive: { type: 'boolean' },
    status: {
      type: 'string',
      enum: [
        'present',
        'missing',
        'undocumented',
        'duplicate',
        'conflicting-source',
        'optional',
        'unknown',
      ],
    },
    baseline: { type: ['string', 'null'] },
    sources: { type: 'array', items: { type: 'string' } },
    required: { type: ['boolean', 'null'] },
    suggestedAction: {
      type: 'string',
      enum: [
        'none',
        'configure',
        'document',
        'review-source',
        'choose-baseline',
      ],
    },
  },
} as const;

const projectEnvironmentContractSectionResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'scope',
    'baselineStatus',
    'baseline',
    'baselineCandidates',
    'sourceFiles',
    'variables',
  ],
  properties: {
    scope: {
      type: 'string',
      enum: ['default', 'test', 'production', 'docker'],
    },
    baselineStatus: {
      type: 'string',
      enum: ['resolved', 'ambiguous', 'missing'],
    },
    baseline: { type: ['string', 'null'] },
    baselineCandidates: { type: 'array', items: { type: 'string' } },
    sourceFiles: { type: 'array', items: { type: 'string' } },
    variables: {
      type: 'array',
      items: projectEnvironmentContractVariableResponseSchema,
    },
  },
} as const;

export const projectEnvironmentContractResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['sections'],
  properties: {
    sections: {
      type: 'array',
      items: projectEnvironmentContractSectionResponseSchema,
    },
  },
} as const;
