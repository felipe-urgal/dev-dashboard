import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';

import { ApiError } from '../http/api-error.js';
import { commonErrorResponseSchemas } from '../http/response-schemas.js';
import {
  ProjectServiceBindingServiceError,
  type ProjectServiceBindingService,
} from '../services/project-service-binding-service.js';
import { ProjectServiceBindingStoreError } from '../store/project-service-binding-store.js';

interface Options extends FastifyPluginOptions {
  bindings: Pick<
    ProjectServiceBindingService,
    'list' | 'preview' | 'consumers' | 'save' | 'remove'
  >;
}

interface Params {
  projectId: string;
  bindingId?: string;
}
interface Body {
  expectedRevision: string;
  serviceRef: string;
  role?: string;
  environmentInstanceId?: string;
  relation: 'owned' | 'required' | 'observed';
  requiredForStart: boolean;
  enabled: boolean;
  dependencies: Array<{
    serviceRef: string;
    source: 'manual' | 'compose';
    observedAt?: string;
  }>;
}
interface RevisionQuery {
  expectedRevision: string;
}
interface EnvironmentQuery {
  environmentInstanceId?: string;
}
interface ResourceQuery {
  serviceRef: string;
}

const revision = { type: 'string', pattern: '^[a-f0-9]{64}$' } as const;
const serviceRef = {
  type: 'string',
  minLength: 1,
  maxLength: 512,
  pattern: '^(systemd|compose|process|docker):[A-Za-z0-9_.:@/-]{1,500}$',
} as const;
const params = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId'],
  properties: {
    projectId: { type: 'string', minLength: 1, maxLength: 160 },
    bindingId: { type: 'string', minLength: 36, maxLength: 36 },
  },
} as const;
const bindingBody = {
  type: 'object',
  additionalProperties: false,
  required: [
    'expectedRevision',
    'serviceRef',
    'relation',
    'requiredForStart',
    'enabled',
    'dependencies',
  ],
  properties: {
    expectedRevision: revision,
    serviceRef,
    environmentInstanceId: { type: 'string', minLength: 1, maxLength: 512 },
    role: {
      type: 'string',
      minLength: 1,
      maxLength: 64,
      pattern: '^[A-Za-z0-9_.-]+$',
    },
    relation: { type: 'string', enum: ['owned', 'required', 'observed'] },
    requiredForStart: { type: 'boolean' },
    enabled: { type: 'boolean' },
    dependencies: {
      type: 'array',
      maxItems: 32,
      uniqueItems: true,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['serviceRef', 'source'],
        properties: {
          serviceRef,
          source: { type: 'string', enum: ['manual', 'compose'] },
          observedAt: { type: 'string', maxLength: 64 },
        },
      },
    },
  },
} as const;
const projectQuery = {
  type: 'object',
  additionalProperties: false,
  properties: {
    environmentInstanceId: { type: 'string', minLength: 1, maxLength: 512 },
  },
} as const;
const resourceQuery = {
  type: 'object',
  additionalProperties: false,
  required: ['serviceRef'],
  properties: { serviceRef },
} as const;
const revisionQuery = {
  type: 'object',
  additionalProperties: false,
  required: ['expectedRevision'],
  properties: { expectedRevision: revision },
} as const;

const bindingSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'projectId',
    'environmentInstanceId',
    'serviceRef',
    'relation',
    'requiredForStart',
    'enabled',
    'dependencies',
    'createdAt',
    'updatedAt',
  ],
  properties: {
    id: { type: 'string' },
    projectId: { type: 'string' },
    environmentInstanceId: { type: 'string' },
    serviceRef,
    role: {
      type: 'string',
      minLength: 1,
      maxLength: 64,
      pattern: '^[A-Za-z0-9_.-]+$',
    },
    relation: { type: 'string', enum: ['owned', 'required', 'observed'] },
    requiredForStart: { type: 'boolean' },
    enabled: { type: 'boolean' },
    dependencies: bindingBody.properties.dependencies,
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
    availability: { type: 'string', enum: ['observed', 'stale', 'orphaned'] },
    shared: { type: 'boolean' },
    consumerCount: { type: 'integer', minimum: 0 },
  },
} as const;

const listResponse = {
  type: 'object',
  additionalProperties: false,
  required: ['revision', 'bindings', 'partial'],
  properties: {
    revision,
    partial: { type: 'boolean' },
    bindings: { type: 'array', maxItems: 500, items: bindingSchema },
  },
} as const;
const consumerResponse = {
  type: 'object',
  additionalProperties: false,
  required: ['serviceRef', 'bindings', 'partial'],
  properties: {
    serviceRef,
    partial: { type: 'boolean' },
    bindings: { type: 'array', maxItems: 500, items: bindingSchema },
  },
} as const;
const previewResponse = {
  type: 'object',
  additionalProperties: false,
  required: [
    'projectId',
    'environmentInstanceId',
    'candidates',
    'suggestions',
    'partial',
  ],
  properties: {
    projectId: { type: 'string' },
    environmentInstanceId: { type: 'string' },
    partial: { type: 'boolean' },
    diagnostic: { type: 'string' },
    candidates: {
      type: 'array',
      maxItems: 250,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'serviceRef',
          'name',
          'provider',
          'ownership',
          'linkableAsOwned',
        ],
        properties: {
          serviceRef,
          name: { type: 'string' },
          provider: { type: 'string' },
          ownership: { type: 'string' },
          linkableAsOwned: { type: 'boolean' },
        },
      },
    },
    suggestions: {
      type: 'array',
      maxItems: 100,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['serviceRef', 'dependsOnServiceRef', 'source', 'observedAt'],
        properties: {
          serviceRef,
          dependsOnServiceRef: serviceRef,
          source: { type: 'string', enum: ['compose'] },
          observedAt: { type: 'string' },
        },
      },
    },
  },
} as const;
const mutationResponse = {
  type: 'object',
  additionalProperties: false,
  required: ['binding', 'revision'],
  properties: { binding: bindingSchema, revision },
} as const;
const deleteResponse = {
  type: 'object',
  additionalProperties: false,
  required: ['revision'],
  properties: { revision },
} as const;

function translate(error: unknown): never {
  if (error instanceof ProjectServiceBindingStoreError) {
    throw new ApiError({
      statusCode: 409,
      code: 'CONFLICT',
      message: error.message,
    });
  }
  if (error instanceof ProjectServiceBindingServiceError) {
    throw new ApiError({
      statusCode:
        error.code === 'NOT_FOUND'
          ? 404
          : error.code === 'CONFLICT'
            ? 409
            : 400,
      code: error.code,
      message: error.message,
    });
  }
  throw error;
}
async function safe<T>(f: () => Promise<T>): Promise<T> {
  try {
    return await f();
  } catch (error) {
    return translate(error);
  }
}

export const projectServiceBindingRoutes: FastifyPluginAsync<Options> = async (
  app,
  options,
) => {
  app.get<{ Querystring: ResourceQuery }>(
    '/services/bindings/consumers',
    {
      schema: {
        querystring: resourceQuery,
        response: { 200: consumerResponse, ...commonErrorResponseSchemas },
      },
    },
    async (request) =>
      safe(() => options.bindings.consumers(request.query.serviceRef)),
  );

  app.get<{ Params: Params }>(
    '/projects/:projectId/service-bindings',
    {
      schema: {
        params,
        response: { 200: listResponse, ...commonErrorResponseSchemas },
      },
    },
    async (request) =>
      safe(() => options.bindings.list(request.params.projectId)),
  );

  app.get<{ Params: Params; Querystring: EnvironmentQuery }>(
    '/projects/:projectId/service-bindings/preview',
    {
      schema: {
        params,
        querystring: projectQuery,
        response: { 200: previewResponse, ...commonErrorResponseSchemas },
      },
    },
    async (request) =>
      safe(() =>
        options.bindings.preview(
          request.params.projectId,
          request.query.environmentInstanceId,
        ),
      ),
  );

  app.post<{ Params: Params; Body: Body }>(
    '/projects/:projectId/service-bindings',
    {
      schema: {
        params,
        body: bindingBody,
        response: { 200: mutationResponse, ...commonErrorResponseSchemas },
      },
    },
    async (request) =>
      safe(() =>
        options.bindings.save(
          request.params.projectId,
          request.body,
          request.body.expectedRevision,
        ),
      ),
  );

  app.put<{ Params: Params; Body: Body }>(
    '/projects/:projectId/service-bindings/:bindingId',
    {
      schema: {
        params,
        body: bindingBody,
        response: { 200: mutationResponse, ...commonErrorResponseSchemas },
      },
    },
    async (request) =>
      safe(() =>
        options.bindings.save(
          request.params.projectId,
          request.body,
          request.body.expectedRevision,
          request.params.bindingId,
        ),
      ),
  );

  app.delete<{ Params: Params; Querystring: RevisionQuery }>(
    '/projects/:projectId/service-bindings/:bindingId',
    {
      schema: {
        params,
        querystring: revisionQuery,
        response: { 200: deleteResponse, ...commonErrorResponseSchemas },
      },
    },
    async (request) => {
      try {
        return options.bindings.remove(
          request.params.projectId,
          request.params.bindingId!,
          request.query.expectedRevision,
        );
      } catch (error) {
        return translate(error);
      }
    },
  );
};
