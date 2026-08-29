import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';
import type { MachineDatabaseConnection } from '@dev-dashboard/contracts';

import { ApiError, type ApiErrorCode } from '../http/api-error.js';
import { createHttpAbortScope } from '../http/request-abort.js';
import {
  apiErrorResponseSchema,
  commonErrorResponseSchemas,
  machineDatabaseCatalogItemResponseSchema,
  machineDatabaseQueryResultResponseSchema,
  machineDatabaseTableResponseSchema,
} from '../http/response-schemas.js';
import {
  DatabaseExplorerError,
  type DatabaseExplorerService,
} from '../services/database-explorer-service.js';
import type { DatabaseExplorerSessionStore } from '../services/database-explorer-session-store.js';

interface Options extends FastifyPluginOptions {
  databaseExplorerService: DatabaseExplorerService;
  databaseExplorerSessionStore: DatabaseExplorerSessionStore;
}

interface SessionParams {
  sessionId: string;
}

interface SessionConnectionBody {
  driver: 'mysql' | 'mariadb' | 'postgresql';
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  database?: string;
}

interface SessionOperationBody {
  sessionId: string;
  database?: string;
}

interface SessionPreviewBody extends SessionOperationBody {
  schema?: string;
  table: string;
}

interface SessionQueryBody extends SessionOperationBody {
  query: string;
}

const emptyQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {},
} as const;

const sessionIdProperty = {
  type: 'string',
  minLength: 1,
  maxLength: 128,
} as const;

const databaseProperty = {
  type: 'string',
  minLength: 1,
  maxLength: 128,
} as const;

const sessionParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['sessionId'],
  properties: {
    sessionId: sessionIdProperty,
  },
} as const;

const sessionConnectionBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['driver'],
  properties: {
    driver: {
      type: 'string',
      enum: ['mysql', 'mariadb', 'postgresql'],
    },
    host: { type: 'string', minLength: 1, maxLength: 255 },
    port: { type: 'integer', minimum: 1, maximum: 65535 },
    username: { type: 'string', maxLength: 128 },
    password: { type: 'string', maxLength: 4096 },
    database: { type: 'string', maxLength: 128 },
  },
} as const;

const sessionOperationBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['sessionId'],
  properties: {
    sessionId: sessionIdProperty,
    database: databaseProperty,
  },
} as const;

const sessionPreviewBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['sessionId', 'table'],
  properties: {
    sessionId: sessionIdProperty,
    database: databaseProperty,
    schema: { type: 'string', minLength: 1, maxLength: 128 },
    table: { type: 'string', minLength: 1, maxLength: 128 },
  },
} as const;

const sessionQueryBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['sessionId', 'query'],
  properties: {
    sessionId: sessionIdProperty,
    database: databaseProperty,
    query: { type: 'string', minLength: 1, maxLength: 4000 },
  },
} as const;

const sessionResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['sessionId', 'expiresAt'],
  properties: {
    sessionId: { type: 'string', minLength: 1 },
    expiresAt: { type: 'string', format: 'date-time' },
  },
} as const;

const explorerErrorCodes: Record<
  DatabaseExplorerError['reason'],
  { statusCode: number; code: ApiErrorCode }
> = {
  'unsupported-driver': {
    statusCode: 400,
    code: 'DATABASE_EXPLORER_DRIVER_UNSUPPORTED',
  },
  'remote-host': {
    statusCode: 400,
    code: 'DATABASE_EXPLORER_REMOTE_HOST_NOT_ALLOWED',
  },
  'invalid-connection': {
    statusCode: 400,
    code: 'DATABASE_EXPLORER_CONNECTION_INVALID',
  },
  'invalid-query': {
    statusCode: 400,
    code: 'DATABASE_EXPLORER_QUERY_INVALID',
  },
  'client-unavailable': {
    statusCode: 503,
    code: 'DATABASE_EXPLORER_CLIENT_UNAVAILABLE',
  },
  'credentials-rejected': {
    statusCode: 400,
    code: 'DATABASE_EXPLORER_CREDENTIALS_REJECTED',
  },
  'connection-failed': {
    statusCode: 502,
    code: 'DATABASE_EXPLORER_CONNECTION_FAILED',
  },
  'database-unavailable': {
    statusCode: 400,
    code: 'DATABASE_EXPLORER_DATABASE_UNAVAILABLE',
  },
  'command-failed': {
    statusCode: 502,
    code: 'DATABASE_EXPLORER_COMMAND_FAILED',
  },
  aborted: {
    statusCode: 499,
    code: 'DATABASE_EXPLORER_ABORTED',
  },
};

const explorerConnectionErrorResponseSchemas = {
  ...commonErrorResponseSchemas,
  499: apiErrorResponseSchema,
  502: apiErrorResponseSchema,
  503: apiErrorResponseSchema,
} as const;

const explorerSessionErrorResponseSchemas = {
  ...explorerConnectionErrorResponseSchemas,
  410: apiErrorResponseSchema,
} as const;

function asExplorerApiError(error: unknown): never {
  if (error instanceof ApiError) throw error;
  if (error instanceof DatabaseExplorerError) {
    const mapped = explorerErrorCodes[error.reason];
    throw new ApiError({
      statusCode: mapped.statusCode,
      code: mapped.code,
      message: error.message,
    });
  }
  throw new ApiError({
    statusCode: 500,
    code: 'DATABASE_EXPLORER_COMMAND_FAILED',
    message: 'Não foi possível consultar o banco de dados.',
  });
}

function requireSessionConnection(
  store: DatabaseExplorerSessionStore,
  sessionId: string,
  database?: string,
): MachineDatabaseConnection {
  const connection = store.get(sessionId);
  if (!connection) {
    throw new ApiError({
      statusCode: 410,
      code: 'SESSION_EXPIRED',
      message: 'A sessão do Database Explorer expirou ou não existe.',
    });
  }
  return database ? { ...connection, database } : connection;
}

export const databaseExplorerSessionRoutes: FastifyPluginAsync<
  Options
> = async (app, options) => {
  app.post<{ Body: SessionConnectionBody }>(
    '/database/explorer/sessions',
    {
      schema: {
        querystring: emptyQuerySchema,
        body: sessionConnectionBodySchema,
        response: {
          201: sessionResponseSchema,
          ...explorerConnectionErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      const abortScope = createHttpAbortScope(request.raw, reply.raw);
      try {
        await options.databaseExplorerService.listDatabases(
          request.body,
          abortScope.signal,
        );
        const session = options.databaseExplorerSessionStore.create(
          request.body,
        );
        return reply.code(201).send(session);
      } catch (error) {
        return asExplorerApiError(error);
      } finally {
        abortScope.dispose();
      }
    },
  );

  app.delete<{ Params: SessionParams }>(
    '/database/explorer/sessions/:sessionId',
    {
      schema: {
        params: sessionParamsSchema,
        querystring: emptyQuerySchema,
        response: {
          204: { type: 'null' },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      options.databaseExplorerSessionStore.delete(request.params.sessionId);
      return reply.code(204).send();
    },
  );

  app.post<{ Body: SessionOperationBody }>(
    '/database/explorer/sessions/catalog',
    {
      schema: {
        querystring: emptyQuerySchema,
        body: sessionOperationBodySchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['databases'],
            properties: {
              databases: {
                type: 'array',
                items: machineDatabaseCatalogItemResponseSchema,
              },
            },
          },
          ...explorerSessionErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      const abortScope = createHttpAbortScope(request.raw, reply.raw);
      try {
        const connection = requireSessionConnection(
          options.databaseExplorerSessionStore,
          request.body.sessionId,
          request.body.database,
        );
        return {
          databases: await options.databaseExplorerService.listDatabases(
            connection,
            abortScope.signal,
          ),
        };
      } catch (error) {
        return asExplorerApiError(error);
      } finally {
        abortScope.dispose();
      }
    },
  );

  app.post<{ Body: SessionOperationBody }>(
    '/database/explorer/sessions/tables',
    {
      schema: {
        querystring: emptyQuerySchema,
        body: sessionOperationBodySchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['tables'],
            properties: {
              tables: {
                type: 'array',
                items: machineDatabaseTableResponseSchema,
              },
            },
          },
          ...explorerSessionErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      const abortScope = createHttpAbortScope(request.raw, reply.raw);
      try {
        const connection = requireSessionConnection(
          options.databaseExplorerSessionStore,
          request.body.sessionId,
          request.body.database,
        );
        return {
          tables: await options.databaseExplorerService.listTables(
            connection,
            abortScope.signal,
          ),
        };
      } catch (error) {
        return asExplorerApiError(error);
      } finally {
        abortScope.dispose();
      }
    },
  );

  app.post<{ Body: SessionPreviewBody }>(
    '/database/explorer/sessions/preview',
    {
      schema: {
        querystring: emptyQuerySchema,
        body: sessionPreviewBodySchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['result'],
            properties: {
              result: machineDatabaseQueryResultResponseSchema,
            },
          },
          ...explorerSessionErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      const abortScope = createHttpAbortScope(request.raw, reply.raw);
      try {
        const connection = requireSessionConnection(
          options.databaseExplorerSessionStore,
          request.body.sessionId,
          request.body.database,
        );
        return {
          result: await options.databaseExplorerService.preview(
            connection,
            request.body.schema,
            request.body.table,
            abortScope.signal,
          ),
        };
      } catch (error) {
        return asExplorerApiError(error);
      } finally {
        abortScope.dispose();
      }
    },
  );

  app.post<{ Body: SessionQueryBody }>(
    '/database/explorer/sessions/query',
    {
      schema: {
        querystring: emptyQuerySchema,
        body: sessionQueryBodySchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['result'],
            properties: {
              result: machineDatabaseQueryResultResponseSchema,
            },
          },
          ...explorerSessionErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      const abortScope = createHttpAbortScope(request.raw, reply.raw);
      try {
        const connection = requireSessionConnection(
          options.databaseExplorerSessionStore,
          request.body.sessionId,
          request.body.database,
        );
        return {
          result: await options.databaseExplorerService.query(
            connection,
            request.body.query,
            abortScope.signal,
          ),
        };
      } catch (error) {
        return asExplorerApiError(error);
      } finally {
        abortScope.dispose();
      }
    },
  );
};
