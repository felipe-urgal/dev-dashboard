const projectEnvironmentVariableResponseSchema = {
  type: 'object', additionalProperties: false, required: ['name', 'sensitive'],
  properties: {
    name: { type: 'string' },
    value: { type: 'string' },
    sensitive: { type: 'boolean' },
  },
} as const;

const projectEnvironmentFileResponseSchema = {
  type: 'object', additionalProperties: false, required: ['file', 'variables'],
  properties: {
    file: { type: 'string' },
    variables: { type: 'array', items: projectEnvironmentVariableResponseSchema },
  },
} as const;

export const projectEnvironmentOverviewResponseSchema = {
  type: 'object', additionalProperties: false, required: ['files'],
  properties: {
    files: { type: 'array', items: projectEnvironmentFileResponseSchema },
  },
} as const;
