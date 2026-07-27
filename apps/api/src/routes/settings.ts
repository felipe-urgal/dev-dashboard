import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';
import type { RetentionSettings } from '@dev-dashboard/contracts';
import type { RetentionSettingsRepository } from '@dev-dashboard/core';
import { commonErrorResponseSchemas, retentionSettingsSnapshotResponseSchema } from '../http/response-schemas.js';

interface Options extends FastifyPluginOptions { retentionSettingsRepository: RetentionSettingsRepository }

const bodySchema = {
  type: 'object', additionalProperties: false,
  required: ['retentionDays', 'scriptHistoryLimit', 'testHistoryLimit'],
  properties: {
    retentionDays: { type: 'integer', minimum: 1, maximum: 365 },
    scriptHistoryLimit: { type: 'integer', minimum: 10, maximum: 1000 },
    testHistoryLimit: { type: 'integer', minimum: 10, maximum: 500 },
  },
} as const;

export const settingsRoutes: FastifyPluginAsync<Options> = async (app, options) => {
  app.get('/settings/retention', { schema: { response: { 200: retentionSettingsSnapshotResponseSchema, ...commonErrorResponseSchemas } } }, async () => options.retentionSettingsRepository.snapshot());
  app.put<{ Body: RetentionSettings }>('/settings/retention', {
    schema: { body: bodySchema, response: { 200: retentionSettingsSnapshotResponseSchema, ...commonErrorResponseSchemas } },
  }, async (request) => options.retentionSettingsRepository.update(request.body));
};
