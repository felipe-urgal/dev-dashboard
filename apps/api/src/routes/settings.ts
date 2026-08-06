import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';
import type {
  CreateEnvironmentProfileInput,
  RetentionSettings,
} from '@dev-dashboard/contracts';
import {
  ENVIRONMENT_PROFILE_LIMITS,
  EnvironmentProfileRepositoryError,
  RETENTION_SETTINGS_LIMITS,
  type EnvironmentProfileRepository,
  type RetentionSettingsRepository,
} from '@dev-dashboard/core';
import { ApiError } from '../http/api-error.js';
import {
  commonErrorResponseSchemas,
  environmentProfileListResponseSchema,
  environmentProfileResponseSchema,
  retentionSettingsSnapshotResponseSchema,
} from '../http/response-schemas.js';

interface Options extends FastifyPluginOptions {
  retentionSettingsRepository: RetentionSettingsRepository;
  environmentProfileRepository: EnvironmentProfileRepository;
}

const bodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['retentionDays', 'scriptHistoryLimit', 'testHistoryLimit'],
  properties: {
    retentionDays: {
      type: 'integer',
      minimum: RETENTION_SETTINGS_LIMITS.retentionDays.minimum,
      maximum: RETENTION_SETTINGS_LIMITS.retentionDays.maximum,
    },
    scriptHistoryLimit: {
      type: 'integer',
      minimum: RETENTION_SETTINGS_LIMITS.scriptHistoryLimit.minimum,
      maximum: RETENTION_SETTINGS_LIMITS.scriptHistoryLimit.maximum,
    },
    testHistoryLimit: {
      type: 'integer',
      minimum: RETENTION_SETTINGS_LIMITS.testHistoryLimit.minimum,
      maximum: RETENTION_SETTINGS_LIMITS.testHistoryLimit.maximum,
    },
  },
} as const;

const environmentProfileVariableBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['name'],
  properties: {
    name: {
      type: 'string',
      minLength: 1,
      maxLength: ENVIRONMENT_PROFILE_LIMITS.maxNameLength,
    },
    value: {
      type: 'string',
      maxLength: ENVIRONMENT_PROFILE_LIMITS.maxValueLength,
    },
  },
} as const;

const environmentProfileBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'variables'],
  properties: {
    name: {
      type: 'string',
      minLength: 1,
      maxLength: ENVIRONMENT_PROFILE_LIMITS.maxNameLength,
    },
    variables: {
      type: 'array',
      maxItems: ENVIRONMENT_PROFILE_LIMITS.maxVariablesPerProfile,
      items: environmentProfileVariableBodySchema,
    },
  },
} as const;

const environmentProfileParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['profileId'],
  properties: { profileId: { type: 'string', minLength: 1 } },
} as const;

function translateEnvironmentProfileError(error: unknown): never {
  if (error instanceof EnvironmentProfileRepositoryError) {
    const statuses: Record<string, number> = {
      ENVIRONMENT_PROFILE_INVALID: 400,
      ENVIRONMENT_PROFILE_LIMIT_REACHED: 409,
      ENVIRONMENT_PROFILE_NOT_FOUND: 404,
      ENVIRONMENT_PROFILE_NAME_TAKEN: 409,
    };
    throw new ApiError({
      statusCode: statuses[error.code] ?? 400,
      code: error.code,
      message: error.message,
    });
  }
  throw error;
}

export const settingsRoutes: FastifyPluginAsync<Options> = async (
  app,
  options,
) => {
  app.get(
    '/settings/retention',
    {
      schema: {
        response: {
          200: retentionSettingsSnapshotResponseSchema,
          ...commonErrorResponseSchemas,
        },
      },
    },
    async () => options.retentionSettingsRepository.snapshot(),
  );
  app.put<{ Body: RetentionSettings }>(
    '/settings/retention',
    {
      schema: {
        body: bodySchema,
        response: {
          200: retentionSettingsSnapshotResponseSchema,
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => options.retentionSettingsRepository.update(request.body),
  );

  app.get(
    '/settings/environment-profiles',
    {
      schema: {
        response: {
          200: environmentProfileListResponseSchema,
          ...commonErrorResponseSchemas,
        },
      },
    },
    async () => ({
      profiles: options.environmentProfileRepository.list(),
      limits: ENVIRONMENT_PROFILE_LIMITS,
    }),
  );

  app.post<{ Body: CreateEnvironmentProfileInput }>(
    '/settings/environment-profiles',
    {
      schema: {
        body: environmentProfileBodySchema,
        response: {
          201: {
            type: 'object',
            additionalProperties: false,
            required: ['profile'],
            properties: { profile: environmentProfileResponseSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      try {
        return await reply.code(201).send({
          profile: await options.environmentProfileRepository.create(
            request.body,
          ),
        });
      } catch (error) {
        translateEnvironmentProfileError(error);
      }
    },
  );

  app.put<{
    Params: { profileId: string };
    Body: CreateEnvironmentProfileInput;
  }>(
    '/settings/environment-profiles/:profileId',
    {
      schema: {
        params: environmentProfileParamsSchema,
        body: environmentProfileBodySchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['profile'],
            properties: { profile: environmentProfileResponseSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      try {
        return {
          profile: await options.environmentProfileRepository.update(
            request.params.profileId,
            request.body,
          ),
        };
      } catch (error) {
        translateEnvironmentProfileError(error);
      }
    },
  );

  app.delete<{ Params: { profileId: string } }>(
    '/settings/environment-profiles/:profileId',
    {
      schema: {
        params: environmentProfileParamsSchema,
        response: { 204: { type: 'null' }, ...commonErrorResponseSchemas },
      },
    },
    async (request, reply) => {
      try {
        await options.environmentProfileRepository.remove(
          request.params.profileId,
        );
        return await reply.code(204).send();
      } catch (error) {
        translateEnvironmentProfileError(error);
      }
    },
  );
};
