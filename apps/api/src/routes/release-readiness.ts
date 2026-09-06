import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';

import { ApiError } from '../http/api-error.js';
import {
  commonErrorResponseSchemas,
  releaseReadinessSnapshotResponseSchema,
} from '../http/response-schemas.js';
import type { ReleaseReadinessService } from '../services/release-readiness-service.js';
import type { ProjectStore } from '../store/project-store.js';

const DEFAULT_TEST_MAX_AGE_SECONDS = 30 * 60;
const MIN_TEST_MAX_AGE_SECONDS = 60;
const MAX_TEST_MAX_AGE_SECONDS = 24 * 60 * 60;

interface Options extends FastifyPluginOptions {
  projectStore: ProjectStore;
  releaseReadinessService: Pick<ReleaseReadinessService, 'getSnapshot'>;
}

interface Params {
  projectId: string;
}

interface Querystring {
  testMaxAgeSeconds?: number;
}

const paramsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId'],
  properties: {
    projectId: { type: 'string', minLength: 1 },
  },
} as const;

const querystringSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    testMaxAgeSeconds: {
      type: 'integer',
      minimum: MIN_TEST_MAX_AGE_SECONDS,
      maximum: MAX_TEST_MAX_AGE_SECONDS,
    },
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

export const releaseReadinessRoutes: FastifyPluginAsync<Options> = async (
  app,
  options,
) => {
  app.get<{
    Params: Params;
    Querystring: Querystring;
  }>(
    '/projects/:projectId/readiness',
    {
      schema: {
        params: paramsSchema,
        querystring: querystringSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['readiness'],
            properties: {
              readiness: releaseReadinessSnapshotResponseSchema,
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const testMaxAgeSeconds =
        request.query.testMaxAgeSeconds ?? DEFAULT_TEST_MAX_AGE_SECONDS;
      const project = requireProject(
        options.projectStore,
        request.params.projectId,
      );
      return {
        readiness: await options.releaseReadinessService.getSnapshot(project, {
          testMaxAgeMs: testMaxAgeSeconds * 1_000,
        }),
      };
    },
  );
};
