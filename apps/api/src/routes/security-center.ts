import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';

import { ApiError } from '../http/api-error.js';
import { commonErrorResponseSchemas } from '../http/response-schemas.js';
import type { SecurityScannerProvider } from '../services/security-scanner-provider.js';
import type { SecurityScanSnapshotStore } from '../services/security-scan-snapshot-store.js';
import type { SecurityScanResult } from '../services/trivy-security-scanner.js';
import type { ProjectStore } from '../store/project-store.js';

interface Options extends FastifyPluginOptions {
  projectStore: ProjectStore;
  securityScannerProvider: SecurityScannerProvider<SecurityScanResult>;
  securityScanSnapshotStore: Pick<SecurityScanSnapshotStore, 'get' | 'save'>;
}

interface Params {
  projectId: string;
}

const paramsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId'],
  properties: {
    projectId: { type: 'string', minLength: 1 },
  },
} as const;

const emptyBodySchema = {
  type: 'object',
  additionalProperties: false,
  maxProperties: 0,
} as const;

const availabilitySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['state', 'observedAt'],
  properties: {
    state: {
      type: 'string',
      enum: ['available', 'missing', 'unavailable'],
    },
    observedAt: { type: 'string' },
    version: { type: 'string' },
    diagnostic: { type: 'string' },
  },
} as const;

const findingSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'provider',
    'category',
    'ruleId',
    'severity',
    'title',
    'file',
    'fingerprint',
    'observedAt',
  ],
  properties: {
    provider: { type: 'string', enum: ['trivy'] },
    category: { type: 'string', enum: ['secret', 'misconfiguration'] },
    ruleId: { type: 'string' },
    severity: {
      type: 'string',
      enum: ['unknown', 'low', 'medium', 'high', 'critical'],
    },
    title: { type: 'string' },
    file: { type: 'string' },
    line: { type: 'integer', minimum: 1 },
    remediation: { type: 'string' },
    reference: { type: 'string' },
    fingerprint: { type: 'string' },
    observedAt: { type: 'string' },
  },
} as const;

const scanResultSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['provider', 'observedAt', 'findings'],
  properties: {
    provider: { type: 'string', enum: ['trivy'] },
    observedAt: { type: 'string' },
    findings: { type: 'array', items: findingSchema },
  },
} as const;

const freshnessSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['state', 'observedAt', 'ageMs', 'maxAgeMs'],
  properties: {
    state: { type: 'string', enum: ['fresh', 'stale'] },
    observedAt: { type: 'string' },
    ageMs: { type: 'integer', minimum: 0 },
    maxAgeMs: { type: 'integer', minimum: 1 },
  },
} as const;

const snapshotSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['result', 'storedAt', 'freshness'],
  properties: {
    result: scanResultSchema,
    storedAt: { type: 'string' },
    freshness: freshnessSchema,
  },
} as const;

const scanExecutionSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['state', 'observedAt'],
  properties: {
    state: {
      type: 'string',
      enum: ['completed', 'failed', 'invalid-output'],
    },
    observedAt: { type: 'string' },
    result: scanResultSchema,
    diagnostic: { type: 'string' },
  },
} as const;

function requireProject(store: ProjectStore, projectId: string) {
  const project = store.findProject(projectId);
  if (!project) {
    throw new ApiError({
      statusCode: 404,
      code: 'PROJECT_NOT_FOUND',
      message: 'Projeto não encontrado.',
    });
  }
  return project;
}

export const securityCenterRoutes: FastifyPluginAsync<Options> = async (
  app,
  options,
) => {
  app.get(
    '/security-center/availability',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['provider', 'availability'],
            properties: {
              provider: { type: 'string' },
              availability: availabilitySchema,
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async () => ({
      provider: options.securityScannerProvider.id,
      availability: await options.securityScannerProvider.availability(),
    }),
  );

  app.get<{ Params: Params }>(
    '/projects/:projectId/security-center/snapshot',
    {
      schema: {
        params: paramsSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['provider', 'snapshot'],
            properties: {
              provider: { type: 'string' },
              snapshot: { anyOf: [snapshotSchema, { type: 'null' }] },
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = requireProject(
        options.projectStore,
        request.params.projectId,
      );
      return {
        provider: options.securityScannerProvider.id,
        snapshot:
          (await options.securityScanSnapshotStore.get(project)) ?? null,
      };
    },
  );

  app.post<{
    Params: Params;
    Body: Record<string, never>;
  }>(
    '/projects/:projectId/security-center/scan',
    {
      schema: {
        params: paramsSchema,
        body: emptyBodySchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['provider', 'execution'],
            properties: {
              provider: { type: 'string' },
              execution: scanExecutionSchema,
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = requireProject(
        options.projectStore,
        request.params.projectId,
      );
      const execution = await options.securityScannerProvider.scan(project);
      if (execution.state === 'completed' && execution.result) {
        await options.securityScanSnapshotStore.save(project, execution.result);
      }
      return {
        provider: options.securityScannerProvider.id,
        execution,
      };
    },
  );
};
