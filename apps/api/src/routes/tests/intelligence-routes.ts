import type { FastifyInstance } from 'fastify';

import { commonErrorResponseSchemas } from '../../http/response-schemas.js';
import { TestIntelligenceService } from '../../services/test-intelligence-service.js';
import {
  emptyQuerystringSchema,
  requireProject,
  testCommandParamsSchema,
  type TestCommandParams,
  type TestRouteOptions,
} from './helpers.js';

const evidenceSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'changedFile', 'testFiles'],
  properties: {
    kind: { type: 'string', enum: ['direct-file-match'] },
    changedFile: { type: 'string' },
    testFiles: { type: 'array', items: { type: 'string' } },
  },
} as const;

const coverageMetricDeltaProperties = {
  statements: { type: 'number' },
  branches: { type: 'number' },
  functions: { type: 'number' },
  lines: { type: 'number' },
} as const;

const coverageMetricDeltaSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['statements', 'branches', 'functions', 'lines'],
  properties: coverageMetricDeltaProperties,
} as const;

const coverageFileDeltaSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['path', 'statements', 'branches', 'functions', 'lines'],
  properties: {
    path: { type: 'string' },
    ...coverageMetricDeltaProperties,
  },
} as const;

const coverageDeltaSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['state', 'worsenedFiles', 'missingFiles'],
  properties: {
    state: { type: 'string', enum: ['available', 'unknown'] },
    reason: {
      type: 'string',
      enum: [
        'no-current-artifact',
        'identity-incomplete',
        'no-compatible-baseline',
      ],
    },
    currentGeneratedAt: { type: 'string' },
    baselineGeneratedAt: { type: 'string' },
    total: coverageMetricDeltaSchema,
    worsenedFiles: { type: 'array', items: coverageFileDeltaSchema },
    missingFiles: { type: 'array', items: { type: 'string' } },
  },
} as const;

const flakinessEvidenceSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'executionId',
    'testIdentity',
    'outcome',
    'gitRevision',
    'gitDirtyFingerprint',
  ],
  properties: {
    executionId: { type: 'string' },
    testIdentity: { type: 'string' },
    outcome: { type: 'string', enum: ['passed', 'failed'] },
    gitRevision: { type: 'string' },
    gitDirtyFingerprint: { type: 'string' },
    environmentInstanceId: { type: 'string' },
  },
} as const;

const flakyTestSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['testIdentity', 'attempts', 'passed', 'failed', 'evidence'],
  properties: {
    testIdentity: { type: 'string' },
    attempts: { type: 'integer', minimum: 2 },
    passed: { type: 'integer', minimum: 0 },
    failed: { type: 'integer', minimum: 0 },
    evidence: { type: 'array', items: flakinessEvidenceSchema },
  },
} as const;

const flakinessSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['state', 'tests'],
  properties: {
    state: { type: 'string', enum: ['available', 'unknown'] },
    reason: {
      type: 'string',
      enum: [
        'no-granular-results',
        'identity-incomplete',
        'insufficient-compatible-attempts',
      ],
    },
    tests: { type: 'array', items: flakyTestSchema },
  },
} as const;

const suggestionSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'commandId',
    'state',
    'recommendation',
    'baseBranch',
    'currentBranch',
    'changedFiles',
    'testFiles',
    'unmappedFiles',
    'evidence',
    'coverageDelta',
    'flakiness',
  ],
  properties: {
    commandId: { type: 'string' },
    state: { type: 'string', enum: ['direct', 'impacted', 'unknown'] },
    recommendation: { type: 'string', enum: ['targeted', 'full-suite'] },
    baseBranch: { type: 'string' },
    currentBranch: { type: 'string' },
    changedFiles: { type: 'array', items: { type: 'string' } },
    testFiles: { type: 'array', items: { type: 'string' } },
    unmappedFiles: { type: 'array', items: { type: 'string' } },
    evidence: { type: 'array', items: evidenceSchema },
    coverageDelta: coverageDeltaSchema,
    flakiness: flakinessSchema,
  },
} as const;

export function registerTestIntelligenceRoutes(
  app: FastifyInstance,
  options: TestRouteOptions,
): void {
  const service = new TestIntelligenceService(options.testDetectionService, {
    ...(options.projectCoverageService
      ? { projectCoverageService: options.projectCoverageService }
      : {}),
    ...(options.projectCoverageHistoryService
      ? { projectCoverageHistoryService: options.projectCoverageHistoryService }
      : {}),
  });

  app.get<{ Params: TestCommandParams }>(
    '/projects/:projectId/tests/:commandId/intelligence',
    {
      schema: {
        params: testCommandParamsSchema,
        querystring: emptyQuerystringSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['suggestion'],
            properties: { suggestion: suggestionSchema },
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
        suggestion: await service.suggest(project, request.params.commandId),
      };
    },
  );
}
