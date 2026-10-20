import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';

import { commonErrorResponseSchemas } from '../http/response-schemas.js';
import type { ConfirmedLifecycleReconciliationService } from '../services/confirmed-lifecycle-reconciliation-service.js';
import type { ConfirmedLifecycleRecoveryReviewService } from '../services/confirmed-lifecycle-recovery-review-service.js';

interface Options extends FastifyPluginOptions {
  reconciliation: Pick<
    ConfirmedLifecycleReconciliationService,
    'list' | 'inspect'
  >;
  recovery: Pick<
    ConfirmedLifecycleRecoveryReviewService,
    'inspect' | 'recordReview'
  >;
}
interface ProjectParams {
  projectId: string;
}
interface JobParams extends ProjectParams {
  jobId: string;
}

const projectParams = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId'],
  properties: { projectId: { type: 'string', minLength: 1, maxLength: 160 } },
} as const;
const jobParams = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId', 'jobId'],
  properties: {
    projectId: { type: 'string', minLength: 1, maxLength: 160 },
    jobId: { type: 'string', pattern: '^[a-f0-9-]{36}$' },
  },
} as const;
const strings = { type: 'string' } as const;
const state = {
  type: 'string',
  enum: ['running', 'completed', 'failed', 'partial'],
} as const;
const stage = {
  type: 'string',
  enum: ['prepared', 'invoking', 'verifying', 'finished'],
} as const;

const summarySchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'environmentInstanceId',
    'action',
    'status',
    'stage',
    'startedAt',
    'reconciliationRequired',
    'completedSteps',
  ],
  properties: {
    id: strings,
    environmentInstanceId: strings,
    action: { type: 'string', enum: ['start', 'stop'] },
    status: state,
    stage,
    startedAt: strings,
    reconciliationRequired: { type: 'boolean' },
    inFlightRef: strings,
    completedSteps: { type: 'integer', minimum: 0 },
  },
} as const;

const nodeSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'serviceRef',
    'journalState',
    'observedState',
    'readiness',
    'assessment',
    'diagnostic',
  ],
  properties: {
    serviceRef: strings,
    journalState: {
      type: 'string',
      enum: ['not-attempted', 'in-flight', 'completed', 'failed', 'unverified'],
    },
    observedState: {
      type: 'string',
      enum: [
        'running',
        'starting',
        'stopping',
        'stopped',
        'failed',
        'unknown',
        'missing',
      ],
    },
    readiness: { type: 'string', enum: ['ready', 'unhealthy', 'unknown'] },
    assessment: {
      type: 'string',
      enum: ['matches-target', 'diverged', 'unverifiable'],
    },
    diagnostic: strings,
  },
} as const;
const detailSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'jobId',
    'projectId',
    'environmentInstanceId',
    'action',
    'journalStatus',
    'stage',
    'startedAt',
    'updatedAt',
    'observationComplete',
    'reconciliationRequired',
    'possibleActiveExecution',
    'safeToRetry',
    'nodes',
    'diagnostics',
  ],
  properties: {
    jobId: strings,
    projectId: strings,
    environmentInstanceId: strings,
    action: { type: 'string', enum: ['start', 'stop'] },
    journalStatus: state,
    stage,
    inFlightRef: strings,
    startedAt: strings,
    updatedAt: strings,
    observedAt: strings,
    observationComplete: { type: 'boolean' },
    reconciliationRequired: { type: 'boolean' },
    possibleActiveExecution: { type: 'boolean' },
    safeToRetry: { type: 'boolean', enum: [false] },
    nodes: { type: 'array', maxItems: 200, items: nodeSchema },
    diagnostics: { type: 'array', items: strings },
  },
} as const;

const leaseEvidenceSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['resourceKey', 'status', 'ownerProcess', 'diagnostic'],
  properties: {
    resourceKey: strings,
    status: { type: 'string', enum: ['absent', 'present', 'unverifiable'] },
    ownerProcess: {
      type: 'string',
      enum: ['alive', 'not-observed', 'unknown'],
    },
    diagnostic: strings,
  },
} as const;
const recoveryEvidenceSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'jobId',
    'projectId',
    'environmentInstanceId',
    'checkedAt',
    'reconciliation',
    'leases',
    'otherInstancesExcluded',
    'manualReviewRequired',
    'safeToRetry',
    'leaseReleaseAuthorized',
    'diagnostics',
  ],
  properties: {
    jobId: strings,
    projectId: strings,
    environmentInstanceId: strings,
    checkedAt: strings,
    reconciliation: detailSchema,
    leases: { type: 'array', maxItems: 250, items: leaseEvidenceSchema },
    otherInstancesExcluded: { type: 'boolean', enum: [false] },
    manualReviewRequired: { type: 'boolean', enum: [true] },
    safeToRetry: { type: 'boolean', enum: [false] },
    leaseReleaseAuthorized: { type: 'boolean', enum: [false] },
    diagnostics: { type: 'array', maxItems: 12, items: strings },
  },
} as const;
const reviewedSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['recorded', 'safeToRetry', 'leaseReleaseAuthorized'],
  properties: {
    recorded: { type: 'boolean', enum: [true] },
    safeToRetry: { type: 'boolean', enum: [false] },
    leaseReleaseAuthorized: { type: 'boolean', enum: [false] },
  },
} as const;

export const confirmedLifecycleReconciliationRoutes: FastifyPluginAsync<
  Options
> = async (app, options) => {
  app.get<{ Params: ProjectParams }>(
    '/projects/:projectId/service-jobs',
    {
      schema: {
        params: projectParams,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['jobs'],
            properties: {
              jobs: { type: 'array', maxItems: 100, items: summarySchema },
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => ({
      jobs: options.reconciliation.list(request.params.projectId),
    }),
  );
  app.get<{ Params: JobParams }>(
    '/projects/:projectId/service-jobs/:jobId/reconciliation',
    {
      schema: {
        params: jobParams,
        response: { 200: detailSchema, ...commonErrorResponseSchemas },
      },
    },
    async (request) =>
      options.reconciliation.inspect(
        request.params.projectId,
        request.params.jobId,
      ),
  );
  app.get<{ Params: JobParams }>(
    '/projects/:projectId/service-jobs/:jobId/recovery-evidence',
    {
      schema: {
        params: jobParams,
        response: {
          200: recoveryEvidenceSchema,
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) =>
      options.recovery.inspect(request.params.projectId, request.params.jobId),
  );
  // Audit-only POST. This does not approve recovery or mutate the runtime.
  app.post<{ Params: JobParams }>(
    '/projects/:projectId/service-jobs/:jobId/recovery-review',
    {
      schema: {
        params: jobParams,
        response: { 200: reviewedSchema, ...commonErrorResponseSchemas },
      },
    },
    async (request) =>
      options.recovery.recordReview(
        request.params.projectId,
        request.params.jobId,
      ),
  );
};
