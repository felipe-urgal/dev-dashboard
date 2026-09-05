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
  },
} as const;

export function registerTestIntelligenceRoutes(
  app: FastifyInstance,
  options: TestRouteOptions,
): void {
  const service = new TestIntelligenceService(options.testDetectionService);

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
