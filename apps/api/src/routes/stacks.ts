import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';

import type {
  Stack,
  StackRestartResult,
  StackStartResult,
  StackStopResult,
} from '@dev-dashboard/contracts';

import { ApiError } from '../http/api-error.js';
import { commonErrorResponseSchemas } from '../http/response-schemas.js';
import {
  StackDefinitionServiceError,
  type StackDefinitionService,
} from '../services/stack-definition-service.js';
import {
  StackDependencyDiscoveryServiceError,
  type StackDependencyDiscoveryService,
} from '../services/stack-dependency-discovery-service.js';
import {
  StackCheckServiceError,
  type StackCheckService,
} from '../services/stack-check-service.js';
import type { StackRestartService } from '../services/stack-restart-service.js';
import {
  StackLogsServiceError,
  type StackLogsService,
} from '../services/stack-logs-service.js';
import type { StackStartService } from '../services/stack-start-service.js';
import type { StackStopService } from '../services/stack-stop-service.js';
import { StackTopologyServiceError } from '../services/stack-topology-service.js';
import { stackRevision } from '../services/stack-revision.js';
import type { StackResourceCatalogService } from '../services/stack-resource-catalog-service.js';
import type { StackOperationJournal } from '../services/stack-operation-journal.js';

interface Options extends FastifyPluginOptions {
  stackDefinitionService: Pick<
    StackDefinitionService,
    'list' | 'findById' | 'save' | 'delete'
  >;
  stackResourceCatalogService: Pick<StackResourceCatalogService, 'list'>;
  stackDependencyDiscoveryService: Pick<
    StackDependencyDiscoveryService,
    'discover'
  >;
  stackCheckService: Pick<StackCheckService, 'check'>;
  stackLogsService: Pick<StackLogsService, 'read'>;
  stackRestartService: Pick<StackRestartService, 'restart'>;
  stackStartService: Pick<StackStartService, 'start'>;
  stackStopService: Pick<StackStopService, 'stop'>;
  stackOperationJournal?: Pick<
    StackOperationJournal,
    'begin' | 'finish' | 'interrupted' | 'list'
  >;
}

interface RevisionBody {
  expectedRevision: string;
}

const revisionBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['expectedRevision'],
  properties: {
    expectedRevision: { type: 'string', pattern: '^[a-f0-9]{64}$' },
  },
} as const;

interface StackParams {
  stackId: string;
}

interface StackNodeParams extends StackParams {
  nodeId: string;
}

const stackParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['stackId'],
  properties: {
    stackId: { type: 'string', minLength: 1, maxLength: 160 },
  },
} as const;

const stackNodeParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['stackId', 'nodeId'],
  properties: {
    stackId: { type: 'string', minLength: 1, maxLength: 160 },
    nodeId: { type: 'string', minLength: 1, maxLength: 160 },
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

const stackResourceSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'target'],
  properties: {
    name: { type: 'string' },
    target: stackTargetSchema,
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

const stackDependencySuggestionEvidenceSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'source',
    'projectId',
    'environmentInstanceId',
    'service',
    'dependsOnService',
    'observedAt',
  ],
  properties: {
    source: { type: 'string', enum: ['compose'] },
    projectId: { type: 'string' },
    environmentInstanceId: { type: 'string' },
    service: { type: 'string' },
    dependsOnService: { type: 'string' },
    observedAt: { type: 'string' },
  },
} as const;

const stackDependencySuggestionSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['dependency', 'evidence'],
  properties: {
    dependency: stackDependencySchema,
    evidence: stackDependencySuggestionEvidenceSchema,
  },
} as const;

const stackDependencyDiscoveryDiagnosticSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['source', 'projectId', 'environmentInstanceId', 'message'],
  properties: {
    source: { type: 'string', enum: ['compose'] },
    projectId: { type: 'string' },
    environmentInstanceId: { type: 'string' },
    message: { type: 'string' },
  },
} as const;

const stackDependencyDiscoverySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['stackId', 'suggestions', 'diagnostics'],
  properties: {
    stackId: { type: 'string' },
    suggestions: {
      type: 'array',
      items: stackDependencySuggestionSchema,
    },
    diagnostics: {
      type: 'array',
      items: stackDependencyDiscoveryDiagnosticSchema,
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

const stackNodeLogSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['nodeId', 'state', 'source', 'readAt'],
  properties: {
    nodeId: { type: 'string' },
    state: {
      type: 'string',
      enum: ['available', 'empty', 'unsupported', 'unavailable'],
    },
    source: {
      type: 'string',
      enum: ['compose', 'process', 'none'],
    },
    content: { type: 'string' },
    truncated: { type: 'boolean' },
    masked: { type: 'boolean' },
    redactionCount: { type: 'integer', minimum: 0 },
    readAt: { type: 'string' },
    diagnostic: { type: 'string' },
  },
} as const;

const stackLogsSnapshotSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['stackId', 'readAt', 'nodes'],
  properties: {
    stackId: { type: 'string' },
    readAt: { type: 'string' },
    nodes: { type: 'array', items: stackNodeLogSchema },
  },
} as const;

const stackOperationRecordSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'version',
    'id',
    'stackId',
    'projectIds',
    'action',
    'expectedRevision',
    'plannedNodeIds',
    'status',
    'steps',
    'startedAt',
    'updatedAt',
    'reconciliationRequired',
  ],
  properties: {
    version: { type: 'integer', const: 1 },
    id: { type: 'string' },
    stackId: { type: 'string' },
    projectIds: { type: 'array', items: { type: 'string' } },
    action: { type: 'string', enum: ['start', 'stop', 'restart'] },
    expectedRevision: { type: 'string' },
    plannedNodeIds: { type: 'array', items: { type: 'string' } },
    status: {
      type: 'string',
      enum: ['running', 'completed', 'blocked', 'failed', 'interrupted'],
    },
    steps: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['nodeId', 'state'],
        properties: { nodeId: { type: 'string' }, state: { type: 'string' } },
      },
    },
    startedAt: { type: 'string' },
    updatedAt: { type: 'string' },
    finishedAt: { type: 'string' },
    reconciliationRequired: { type: 'boolean' },
  },
} as const;

const stackStartStepSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['nodeId', 'state'],
  properties: {
    nodeId: { type: 'string' },
    state: {
      type: 'string',
      enum: ['already-ready', 'started', 'blocked', 'failed'],
    },
    diagnostic: { type: 'string' },
  },
} as const;

const stackStartResultSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['stackId', 'state', 'steps', 'check'],
  properties: {
    stackId: { type: 'string' },
    state: {
      type: 'string',
      enum: ['completed', 'blocked', 'failed'],
    },
    steps: { type: 'array', items: stackStartStepSchema },
    check: stackCheckSchema,
  },
} as const;

const stackStopStepSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['nodeId', 'state'],
  properties: {
    nodeId: { type: 'string' },
    state: {
      type: 'string',
      enum: ['already-stopped', 'stopped', 'retained', 'blocked', 'failed'],
    },
    diagnostic: { type: 'string' },
  },
} as const;

const stackStopResultSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['stackId', 'state', 'steps', 'check'],
  properties: {
    stackId: { type: 'string' },
    state: {
      type: 'string',
      enum: ['completed', 'blocked', 'failed'],
    },
    steps: { type: 'array', items: stackStopStepSchema },
    check: stackCheckSchema,
  },
} as const;

const stackRestartResultSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['stackId', 'nodeId', 'state', 'check'],
  properties: {
    stackId: { type: 'string' },
    nodeId: { type: 'string' },
    state: {
      type: 'string',
      enum: ['restarted', 'blocked', 'failed'],
    },
    diagnostic: { type: 'string' },
    check: stackCheckSchema,
  },
} as const;

function requireRevision(actual: Stack | null, expected: string): void {
  if (!actual || stackRevision(actual) !== expected) {
    throw new ApiError({
      statusCode: 409,
      code: 'CONFLICT',
      message:
        'Stack definition changed or was deleted. Refresh the Stack and review its topology before retrying.',
    });
  }
}

function mapStackError(error: unknown): unknown {
  if (error instanceof StackLogsServiceError) {
    return new ApiError({
      statusCode: 404,
      code: 'NOT_FOUND',
      message: error.message,
    });
  }

  if (error instanceof StackDependencyDiscoveryServiceError) {
    return new ApiError({
      statusCode: 404,
      code: 'NOT_FOUND',
      message: error.message,
    });
  }

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
  async function recordedOperation<
    T extends StackStartResult | StackStopResult | StackRestartResult,
  >(
    stackId: string,
    action: 'start' | 'stop' | 'restart',
    expectedRevision: string,
    execute: () => Promise<T>,
    restartNodeId?: string,
  ): Promise<{ result: T; operationId?: string }> {
    const journal = options.stackOperationJournal;
    if (!journal) return { result: await execute() };
    // Only the server-observed topology is allowed to define journal intent.
    const check = await options.stackCheckService.check(stackId);
    requireRevision(check.stack, expectedRevision);
    const order =
      action === 'start'
        ? check.topology.startOrder
        : action === 'stop'
          ? check.topology.stopOrder
          : restartNodeId
            ? [restartNodeId]
            : [];
    if (order.some((id) => !check.stack.nodes.some((node) => node.id === id))) {
      throw new ApiError({
        statusCode: 409,
        code: 'CONFLICT',
        message: 'Stack topology changed. Refresh before retrying.',
      });
    }
    const id = journal.begin(check.stack, action, expectedRevision, order);
    try {
      const result = await execute();
      journal.finish(id, result);
      return { result, operationId: id };
    } catch (error) {
      journal.interrupted(id);
      throw error;
    }
  }

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
              revisions: {
                type: 'object',
                additionalProperties: { type: 'string' },
              },
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async () => {
      const stacks = options.stackDefinitionService.list();
      return {
        stacks,
        revisions: Object.fromEntries(
          stacks.map((stack) => [stack.id, stackRevision(stack)]),
        ),
      };
    },
  );

  app.get(
    '/stacks/resources',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['resources'],
            properties: {
              resources: { type: 'array', items: stackResourceSchema },
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async () => ({
      resources: await options.stackResourceCatalogService.list(),
    }),
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
            properties: {
              stack: stackSchema,
              revision: { type: 'string' },
            },
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
      return { stack, revision: stackRevision(stack) };
    },
  );

  app.get<{ Params: StackParams }>(
    '/stacks/:stackId/dependency-suggestions',
    {
      schema: {
        params: stackParamsSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['discovery'],
            properties: { discovery: stackDependencyDiscoverySchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      try {
        return {
          discovery: await options.stackDependencyDiscoveryService.discover(
            request.params.stackId,
          ),
        };
      } catch (error) {
        throw mapStackError(error);
      }
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
            properties: {
              check: stackCheckSchema,
              revision: { type: 'string' },
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      try {
        const check = await options.stackCheckService.check(
          request.params.stackId,
        );
        return { check, revision: stackRevision(check.stack) };
      } catch (error) {
        throw mapStackError(error);
      }
    },
  );

  app.get<{ Params: StackParams }>(
    '/stacks/:stackId/operations',
    {
      schema: {
        params: stackParamsSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['operations'],
            properties: {
              operations: { type: 'array', items: stackOperationRecordSchema },
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      if (!options.stackDefinitionService.findById(request.params.stackId)) {
        throw new ApiError({
          statusCode: 404,
          code: 'NOT_FOUND',
          message: 'Stack not found.',
        });
      }
      return {
        operations:
          options.stackOperationJournal?.list(request.params.stackId) ?? [],
      };
    },
  );

  app.get<{ Params: StackParams }>(
    '/stacks/:stackId/logs',
    {
      schema: {
        params: stackParamsSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['logs'],
            properties: { logs: stackLogsSnapshotSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      try {
        return {
          logs: await options.stackLogsService.read(request.params.stackId),
        };
      } catch (error) {
        throw mapStackError(error);
      }
    },
  );

  app.post<{ Params: StackParams; Body: RevisionBody }>(
    '/stacks/:stackId/start',
    {
      schema: {
        params: stackParamsSchema,
        body: revisionBodySchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['result'],
            properties: {
              result: stackStartResultSchema,
              operationId: { type: 'string' },
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      try {
        return await recordedOperation(
          request.params.stackId,
          'start',
          request.body.expectedRevision,
          () =>
            options.stackStartService.start(
              request.params.stackId,
              request.body.expectedRevision,
            ),
        );
      } catch (error) {
        throw mapStackError(error);
      }
    },
  );

  app.post<{ Params: StackParams; Body: RevisionBody }>(
    '/stacks/:stackId/stop',
    {
      schema: {
        params: stackParamsSchema,
        body: revisionBodySchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['result'],
            properties: {
              result: stackStopResultSchema,
              operationId: { type: 'string' },
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      try {
        return await recordedOperation(
          request.params.stackId,
          'stop',
          request.body.expectedRevision,
          () =>
            options.stackStopService.stop(
              request.params.stackId,
              request.body.expectedRevision,
            ),
        );
      } catch (error) {
        throw mapStackError(error);
      }
    },
  );

  app.post<{
    Params: StackNodeParams;
    Body: RevisionBody;
  }>(
    '/stacks/:stackId/nodes/:nodeId/restart',
    {
      schema: {
        params: stackNodeParamsSchema,
        body: revisionBodySchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['result'],
            properties: {
              result: stackRestartResultSchema,
              operationId: { type: 'string' },
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      try {
        return await recordedOperation(
          request.params.stackId,
          'restart',
          request.body.expectedRevision,
          () =>
            options.stackRestartService.restart(
              request.params.stackId,
              request.params.nodeId,
              request.body.expectedRevision,
            ),
          request.params.nodeId,
        );
      } catch (error) {
        throw mapStackError(error);
      }
    },
  );

  app.put<{ Params: StackParams; Body: Stack & { expectedRevision?: string } }>(
    '/stacks/:stackId',
    {
      schema: {
        params: stackParamsSchema,
        body: {
          ...stackSchema,
          properties: {
            ...stackSchema.properties,
            expectedRevision: { type: 'string', pattern: '^[a-f0-9]{64}$' },
          },
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['stack'],
            properties: { stack: stackSchema, revision: { type: 'string' } },
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
        const existing = options.stackDefinitionService.findById(
          request.params.stackId,
        );
        if (existing) {
          requireRevision(existing, request.body.expectedRevision ?? '');
        } else if (request.body.expectedRevision !== undefined) {
          requireRevision(null, request.body.expectedRevision);
        }
        const { expectedRevision: _expectedRevision, ...definition } =
          request.body;
        const stack = options.stackDefinitionService.save(definition);
        return { stack, revision: stackRevision(stack) };
      } catch (error) {
        throw mapStackError(error);
      }
    },
  );

  app.delete<{ Params: StackParams; Body: RevisionBody }>(
    '/stacks/:stackId',
    {
      schema: {
        params: stackParamsSchema,
        body: revisionBodySchema,
        response: {
          204: { type: 'null' },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      requireRevision(
        options.stackDefinitionService.findById(request.params.stackId),
        request.body.expectedRevision,
      );
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
