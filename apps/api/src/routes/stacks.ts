import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';

import type { Stack } from '@dev-dashboard/contracts';

import { ApiError } from '../http/api-error.js';
import { commonErrorResponseSchemas } from '../http/response-schemas.js';
import {
  StackDefinitionServiceError,
  type StackDefinitionService,
} from '../services/stack-definition-service.js';
import {
  StackCheckServiceError,
  type StackCheckService,
} from '../services/stack-check-service.js';
import { StackTopologyServiceError } from '../services/stack-topology-service.js';

interface Options extends FastifyPluginOptions {
  stackDefinitionService: Pick<
    StackDefinitionService,
    'list' | 'findById' | 'save' | 'delete'
  >;
  stackCheckService: Pick<StackCheckService, 'check'>;
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

const stackTargetSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'projectId'],
  properties: {
    kind: {
      type: 'string',
      enum: ['environment', 'process', 'compose-service', 'health-check'],
    },
    projectId: { type: 'string', minLength: 1, maxLength: 160 },
    environmentInstanceId: { type: 'string', minLength: 1, maxLength: 256 },
    processId: { type: 'string', minLength: 1, maxLength: 160 },
    service: { type: 'string', minLength: 1, maxLength: 160 },
    checkId: { type: 'string', minLength: 1, maxLength: 160 },
  },
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

const stackTopologyPlanSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['stackId', 'startOrder', 'stopOrder'],
  properties: {
    stackId: { type: 'string' },
    startOrder: { type: 'array', items: { type: 'string' } },
    stopOrder: { type: 'array', items: { type: 'string' } },
  },
} as const;

const stackNodeHealthSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['nodeId', 'state', 'observedAt'],
  properties: {
    nodeId: { type: 'string' },
    state: {
      type: 'string',
      enum: ['ready', 'starting', 'stopped', 'failed', 'blocked', 'unknown'],
    },
    observedAt: { type: 'string' },
    diagnostic: { type: 'string' },
  },
} as const;

const stackHealthSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['stackId', 'state', 'observedAt', 'nodes'],
  properties: {
    stackId: { type: 'string' },
    state: {
      type: 'string',
      enum: ['ready', 'starting', 'stopped', 'failed', 'blocked', 'unknown'],
    },
    observedAt: { type: 'string' },
    nodes: { type: 'array', items: stackNodeHealthSchema },
  },
} as const;

const stackCheckSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['stack', 'topology', 'health'],
  properties: {
    stack: stackSchema,
    topology: stackTopologyPlanSchema,
    health: stackHealthSchema,
  },
} as const;

function mapStackError(error: unknown): unknown {
  if (error instanceof StackCheckServiceError) {
    return new ApiError({
      statusCode: 404,
      code: 'NOT_FOUND',
      message: error.message,
    });
  }

  if (error instanceof StackDefinitionServiceError) {
    return new ApiError({
      statusCode:
        error.code === 'STACK_ENVIRONMENT_PROJECT_MISMATCH' ? 409 : 404,
      code:
        error.code === 'STACK_ENVIRONMENT_PROJECT_MISMATCH'
          ? 'CONFLICT'
          : 'NOT_FOUND',
      message: error.message,
    });
  }

  if (!(error instanceof StackTopologyServiceError)) return error;

  return new ApiError({
    statusCode: error.code === 'STACK_DEPENDENCY_CYCLE' ? 409 : 400,
    code: error.code === 'STACK_DEPENDENCY_CYCLE' ? 'CONFLICT' : 'BAD_REQUEST',
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
    async () => ({ stacks: options.stackDefinitionService.list() }),
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
      const stack = options.stackDefinitionService.findById(
        request.params.stackId,
      );
      if (!stack) {
        throw new ApiError({
          statusCode: 404,
          code: 'NOT_FOUND',
          message: 'Stack not found.',
        });
      }
      return { stack };
    },
  );

  app.get<{ Params: StackParams }>(
    '/stacks/:stackId/check',
    {
      schema: {
        params: stackParamsSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['check'],
            properties: { check: stackCheckSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      try {
        return {
          check: options.stackCheckService.check(request.params.stackId),
        };
      } catch (error) {
        throw mapStackError(error);
      }
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
          code: 'BAD_REQUEST',
          message: 'Stack id must match the route parameter.',
        });
      }

      try {
        return { stack: options.stackDefinitionService.save(request.body) };
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
      if (!options.stackDefinitionService.delete(request.params.stackId)) {
        throw new ApiError({
          statusCode: 404,
          code: 'NOT_FOUND',
          message: 'Stack not found.',
        });
      }
      return reply.code(204).send();
    },
  );
};
