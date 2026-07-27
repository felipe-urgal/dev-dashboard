import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';
import type { RetentionSettings } from '@dev-dashboard/contracts';
import { RETENTION_SETTINGS_LIMITS, type RetentionSettingsRepository } from '@dev-dashboard/core';
import { commonErrorResponseSchemas, retentionSettingsSnapshotResponseSchema } from '../http/response-schemas.js';

interface Options extends FastifyPluginOptions { retentionSettingsRepository: RetentionSettingsRepository }

const bodySchema = {
  type: 'object', additionalProperties: false,
  required: ['retentionDays', 'scriptHistoryLimit', 'testHistoryLimit'],
  properties: {
    retentionDays: { type: 'integer', minimum: RETENTION_SETTINGS_LIMITS.retentionDays.minimum, maximum: RETENTION_SETTINGS_LIMITS.retentionDays.maximum },
    scriptHistoryLimit: { type: 'integer', minimum: RETENTION_SETTINGS_LIMITS.scriptHistoryLimit.minimum, maximum: RETENTION_SETTINGS_LIMITS.scriptHistoryLimit.maximum },
    testHistoryLimit: { type: 'integer', minimum: RETENTION_SETTINGS_LIMITS.testHistoryLimit.minimum, maximum: RETENTION_SETTINGS_LIMITS.testHistoryLimit.maximum },
  },
} as const;

export const settingsRoutes: FastifyPluginAsync<Options> = async (app, options) => {
  app.get('/settings/retention', { schema: { response: { 200: retentionSettingsSnapshotResponseSchema, ...commonErrorResponseSchemas } } }, async () => options.retentionSettingsRepository.snapshot());
  app.put<{ Body: RetentionSettings }>('/settings/retention', {
    schema: { body: bodySchema, response: { 200: retentionSettingsSnapshotResponseSchema, ...commonErrorResponseSchemas } },
  }, async (request) => options.retentionSettingsRepository.update(request.body));
};
