import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';

import type { Stack } from '@dev-dashboard/contracts';

import { ApiError } from '../http/api-error.js';
import { commonErrorResponseSchemas } from '../http/response-schemas.js';
import { StackTopologyServiceError } from '../services/stack-topology-service.js';
import type { StackStore } from '../store/stack-store.js';

interface Options extends FastifyPluginOptions {
  stackStore: Pick<StackStore, 'list' | 'findById' | 'save' | 'delete'>;
}

interface StackParams {
  stackId: string;
}

const stackParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['stackId'],
  properties: {
    stackId: { type: 'string', minLength: 1, maxLength: 160 },
  },
} as const;

const environmentTargetSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'projectId', 'environmentInstanceId'],
  properties: {
    kind: { const: 'environment' },
    projectId: { type: 'string', minLength: 1, maxLength: 160 },
    environmentInstanceId: { type: 'string', minLength: 1, maxLength: 256 },
  },
} as const;

const processTargetSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'projectId', 'environmentInstanceId', 'processId'],
  properties: {
    kind: { const: 'process' },
    projectId: { type: 'string', minLength: 1, maxLength: 160 },
    environmentInstanceId: { type: 'string', minLength: 1, maxLength: 256 },
    processId: { type: 'string', minLength: 1, maxLength: 160 },
  },
} as const;

const composeServiceTargetSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'projectId', 'environmentInstanceId', 'service'],
  properties: {
    kind: { const: 'compose-service' },
    projectId: { type: 'string', minLength: 1, maxLength: 160 },
    environmentInstanceId: { type: 'string', minLength: 1, maxLength: 256 },
    service: { type: 'string', minLength: 1, maxLength: 160 },
  },
} as const;

const healthCheckTargetSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'projectId', 'checkId'],
  properties: {
    kind: { const: 'health-check' },
    projectId: { type: 'string', minLength: 1, maxLength: 160 },
    environmentInstanceId: { type: 'string', minLength: 1, maxLength: 256 },
    checkId: { type: 'string', minLength: 1, maxLength: 160 },
  },
} as const;

const stackTargetSchema = {
  anyOf: [
    environmentTargetSchema,
    processTargetSchema,
    composeServiceTargetSchema,
    healthCheckTargetSchema,
  ],
} as const;

const stackNodeSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'name', 'target'],
  properties: {
    id: { type: 'string', minLength: 1, maxLength: 160 },
    name: { type: 'string', minLength: 1, maxLength: 240 },
    target: stackTargetSchema,
  },
} as const;

const stackDependencySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['nodeId', 'dependsOnNodeId'],
  properties: {
    nodeId: { type: 'string', minLength: 1, maxLength: 160 },
    dependsOnNodeId: { type: 'string', minLength: 1, maxLength: 160 },
  },
} as const;

const stackSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'name', 'nodes', 'dependencies'],
  properties: {
    id: { type: 'string', minLength: 1, maxLength: 160 },
    name: { type: 'string', minLength: 1, maxLength: 240 },
    nodes: {
      type: 'array',
      minItems: 1,
      maxItems: 200,
      items: stackNodeSchema,
    },
    dependencies: {
      type: 'array',
      maxItems: 1000,
      items: stackDependencySchema,
    },
  },
} as const;

function mapStackError(error: unknown): unknown {
  if (!(error instanceof StackTopologyServiceError)) return error;

  return new ApiError({
    statusCode: error.code === 'STACK_DEPENDENCY_CYCLE' ? 409 : 400,
    code: error.code,
    message: error.message,
  });
}

export const stackRoutes: FastifyPluginAsync<Options> = async (
  app,
  options,
) => {
  app.get(
    '/stacks',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['stacks'],
            properties: {
              stacks: { type: 'array', items: stackSchema },
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async () => ({ stacks: options.stackStore.list() }),
  );

  app.get<{ Params: StackParams }>(
    '/stacks/:stackId',
    {
      schema: {
        params: stackParamsSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['stack'],
            properties: { stack: stackSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const stack = options.stackStore.findById(request.params.stackId);
      if (!stack) {
        throw new ApiError({
          statusCode: 404,
          code: 'STACK_NOT_FOUND',
          message: 'Stack not found.',
        });
      }
      return { stack };
    },
  );

  app.put<{ Params: StackParams; Body: Stack }>(
    '/stacks/:stackId',
    {
      schema: {
        params: stackParamsSchema,
        body: stackSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['stack'],
            properties: { stack: stackSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      if (request.params.stackId !== request.body.id) {
        throw new ApiError({
          statusCode: 400,
          code: 'STACK_ID_MISMATCH',
          message: 'Stack id must match the route parameter.',
        });
      }

      try {
        return { stack: options.stackStore.save(request.body) };
      } catch (error) {
        throw mapStackError(error);
      }
    },
  );

  app.delete<{ Params: StackParams }>(
    '/stacks/:stackId',
    {
      schema: {
        params: stackParamsSchema,
        response: {
          204: { type: 'null' },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      if (!options.stackStore.delete(request.params.stackId)) {
        throw new ApiError({
          statusCode: 404,
          code: 'STACK_NOT_FOUND',
          message: 'Stack not found.',
        });
      }
      return reply.code(204).send();
    },
  );
};
