import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';

import { ApiError } from '../http/api-error.js';
import { commonErrorResponseSchemas } from '../http/response-schemas.js';
import {
  ServiceRuntimeProfileServiceError,
  type ServiceRuntimeProfileService,
} from '../services/service-runtime-profile-service.js';
import { ServiceRuntimeProfileStoreError } from '../store/service-runtime-profile-store.js';

interface Options extends FastifyPluginOptions {
  profiles: Pick<ServiceRuntimeProfileService, 'list' | 'save' | 'remove'>;
}
interface Params {
  projectId: string;
  environmentInstanceId: string;
  profileId?: string;
}
interface Body {
  kind: 'dev' | 'test' | 'production';
  bindingIds: string[];
  expectedRevision: string;
  expectedBindingsRevision: string;
}
interface RevisionQuery { expectedRevision: string }

const revision = { type: 'string', pattern: '^[a-f0-9]{64}$' } as const;
const params = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId', 'environmentInstanceId'],
  properties: {
    projectId: { type: 'string', minLength: 1, maxLength: 160 },
    environmentInstanceId: { type: 'string', minLength: 1, maxLength: 512 },
    profileId: { type: 'string', pattern: '^[0-9a-f-]{36}$' },
  },
} as const;
const body = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'bindingIds', 'expectedRevision', 'expectedBindingsRevision'],
  properties: {
    kind: { type: 'string', enum: ['dev', 'test', 'production'] },
    bindingIds: {
      type: 'array',
      maxItems: 60,
      uniqueItems: true,
      items: { type: 'string', pattern: '^[0-9a-f-]{36}$' },
    },
    expectedRevision: revision,
    expectedBindingsRevision: revision,
  },
} as const;
const profile = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'projectId', 'environmentInstanceId', 'kind', 'bindingIds', 'createdAt', 'updatedAt', 'staleBindingIds'],
  properties: {
    id: { type: 'string' },
    projectId: { type: 'string' },
    environmentInstanceId: { type: 'string' },
    kind: { type: 'string', enum: ['dev', 'test', 'production'] },
    bindingIds: body.properties.bindingIds,
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
    staleBindingIds: body.properties.bindingIds,
  },
} as const;
const listSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId', 'environmentInstanceId', 'revision', 'bindingsRevision', 'fallback', 'profiles'],
  properties: {
    projectId: { type: 'string' },
    environmentInstanceId: { type: 'string' },
    revision,
    bindingsRevision: revision,
    fallback: { type: 'boolean' },
    profiles: { type: 'array', maxItems: 60, items: profile },
  },
} as const;
const writeSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['profile', 'revision', 'bindingsRevision'],
  properties: { profile, revision, bindingsRevision: revision },
} as const;
const deleteSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['revision'],
  properties: { revision },
} as const;

function translate(error: unknown): never {
  if (error instanceof ServiceRuntimeProfileStoreError)
    throw new ApiError({ statusCode: 409, code: 'CONFLICT', message: error.message });
  if (error instanceof ServiceRuntimeProfileServiceError)
    throw new ApiError({
      statusCode: error.code === 'NOT_FOUND' ? 404 : error.code === 'BAD_REQUEST' ? 400 : 409,
      code: error.code,
      message: error.message,
    });
  throw error;
}

export const serviceRuntimeProfileRoutes: FastifyPluginAsync<Options> = async (app, options) => {
  app.get<{ Params: Params }>(
    '/projects/:projectId/environments/:environmentInstanceId/service-profiles',
    { schema: { params, response: { 200: listSchema, ...commonErrorResponseSchemas } } },
    async (request) => {
      try {
        return options.profiles.list(request.params.projectId, request.params.environmentInstanceId);
      } catch (error) { return translate(error); }
    },
  );

  app.post<{ Params: Params; Body: Body }>(
    '/projects/:projectId/environments/:environmentInstanceId/service-profiles',
    { schema: { params, body, response: { 200: writeSchema, ...commonErrorResponseSchemas } } },
    async (request) => {
      try {
        return options.profiles.save(
          request.params.projectId,
          { kind: request.body.kind, bindingIds: request.body.bindingIds, environmentInstanceId: request.params.environmentInstanceId },
          request.body.expectedRevision,
          request.body.expectedBindingsRevision,
        );
      } catch (error) { return translate(error); }
    },
  );

  app.put<{ Params: Params; Body: Body }>(
    '/projects/:projectId/environments/:environmentInstanceId/service-profiles/:profileId',
    { schema: { params, body, response: { 200: writeSchema, ...commonErrorResponseSchemas } } },
    async (request) => {
      try {
        return options.profiles.save(
          request.params.projectId,
          { kind: request.body.kind, bindingIds: request.body.bindingIds, environmentInstanceId: request.params.environmentInstanceId },
          request.body.expectedRevision,
          request.body.expectedBindingsRevision,
          request.params.profileId,
        );
      } catch (error) { return translate(error); }
    },
  );

  app.delete<{ Params: Params; Querystring: RevisionQuery }>(
    '/projects/:projectId/environments/:environmentInstanceId/service-profiles/:profileId',
    { schema: {
      params,
      querystring: {
        type: 'object', additionalProperties: false, required: ['expectedRevision'],
        properties: { expectedRevision: revision },
      },
      response: { 200: deleteSchema, ...commonErrorResponseSchemas },
    } },
    async (request) => {
      try {
        return options.profiles.remove(
          request.params.projectId, request.params.environmentInstanceId,
          request.params.profileId!, request.query.expectedRevision,
        );
      } catch (error) { return translate(error); }
    },
  );
};
