export const apiErrorDetailsResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['message'],
  properties: {
    path: {
      type: 'string',
    },
    message: {
      type: 'string',
    },
  },
} as const;

export const apiErrorResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['error', 'message'],
  properties: {
    error: {
      type: 'string',
    },
    message: {
      type: 'string',
    },
    details: {
      type: 'array',
      items: apiErrorDetailsResponseSchema,
    },
  },
} as const;

export const commonErrorResponseSchemas = {
  400: apiErrorResponseSchema,
  401: apiErrorResponseSchema,
  403: apiErrorResponseSchema,
  404: apiErrorResponseSchema,
  409: apiErrorResponseSchema,
  500: apiErrorResponseSchema,
} as const;

export const emptyResponseSchema = {
  type: 'null',
} as const;

const retentionValueLimitSchema = {
  type: 'object', additionalProperties: false, required: ['minimum', 'maximum', 'default'],
  properties: { minimum: { type: 'integer' }, maximum: { type: 'integer' }, default: { type: 'integer' } },
} as const;

export const retentionSettingsSnapshotResponseSchema = {
  type: 'object', additionalProperties: false, required: ['values', 'limits', 'appliesAfterRestart'],
  properties: {
    values: { type: 'object', additionalProperties: false, required: ['retentionDays', 'scriptHistoryLimit', 'testHistoryLimit'], properties: {
      retentionDays: { type: 'integer' }, scriptHistoryLimit: { type: 'integer' }, testHistoryLimit: { type: 'integer' },
    } },
    limits: { type: 'object', additionalProperties: false, required: ['retentionDays', 'scriptHistoryLimit', 'testHistoryLimit'], properties: {
      retentionDays: retentionValueLimitSchema, scriptHistoryLimit: retentionValueLimitSchema, testHistoryLimit: retentionValueLimitSchema,
    } },
    appliesAfterRestart: { type: 'boolean' },
  },
} as const;

const environmentProfileVariableResponseSchema = {
  type: 'object', additionalProperties: false, required: ['name'],
  properties: { name: { type: 'string' }, value: { type: 'string' } },
} as const;

export const environmentProfileResponseSchema = {
  type: 'object', additionalProperties: false, required: ['id', 'name', 'variables', 'createdAt', 'updatedAt'],
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    variables: { type: 'array', items: environmentProfileVariableResponseSchema },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
  },
} as const;

const environmentProfileLimitsResponseSchema = {
  type: 'object', additionalProperties: false, required: ['maxProfiles', 'maxVariablesPerProfile', 'maxNameLength', 'maxValueLength'],
  properties: {
    maxProfiles: { type: 'integer' },
    maxVariablesPerProfile: { type: 'integer' },
    maxNameLength: { type: 'integer' },
    maxValueLength: { type: 'integer' },
  },
} as const;

export const environmentProfileListResponseSchema = {
  type: 'object', additionalProperties: false, required: ['profiles', 'limits'],
  properties: {
    profiles: { type: 'array', items: environmentProfileResponseSchema },
    limits: environmentProfileLimitsResponseSchema,
  },
} as const;
