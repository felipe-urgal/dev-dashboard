import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';
import { ApiError, type ApiErrorCode } from '../http/api-error.js';
import { createHttpAbortScope } from '../http/request-abort.js';
import {
  apiErrorResponseSchema,
  commonErrorResponseSchemas,
  databaseRestoreResultResponseSchema,
  databaseSnapshotConfirmationResponseSchema,
  databaseSnapshotListResponseSchema,
  databaseSnapshotResponseSchema,
  machineDatabaseCatalogItemResponseSchema,
  machineDatabaseQueryResultResponseSchema,
  machineDatabaseServiceDetailsResponseSchema,
  machineDatabaseServiceResponseSchema,
  machineDatabaseTableResponseSchema,
  projectDatabaseOverviewResponseSchema,
} from '../http/response-schemas.js';
import {
  DatabaseServiceActionError,
  databaseServiceActionErrorMessage,
  DatabaseServicePackageError,
  databaseServicePackageErrorMessage,
  type DatabaseDetectionService,
} from '../services/database-detection-service.js';
import {
  DatabaseSnapshotError,
  type DatabaseSnapshotService,
} from '../services/database-snapshot-service.js';
import type { ProjectStore } from '../store/project-store.js';
import {
  DatabaseReadonlyError,
  type DatabaseReadonlyService,
} from '../services/database-readonly-service.js';

interface Options extends FastifyPluginOptions {
  projectStore: ProjectStore;
  databaseDetectionService: DatabaseDetectionService;
  databaseSnapshotService: DatabaseSnapshotService;
  databaseReadonlyService: DatabaseReadonlyService;
}
interface Params {
  projectId: string;
}
interface SecretParams extends Params {
  environmentId: string;
}
interface Query {
  page?: number;
  pageSize?: number;
}
interface ExplorerBody {
  driver: 'mysql' | 'mariadb' | 'postgresql';
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  database?: string;
}
interface ExplorerQueryBody extends ExplorerBody {
  query: string;
}
interface ExplorerPreviewBody extends ExplorerBody {
  schema?: string;
  table: string;
}

const explorerErrorCodes: Record<
  DatabaseReadonlyError['reason'],
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

function asExplorerApiError(error: unknown): never {
  if (error instanceof ApiError) throw error;
  if (error instanceof DatabaseReadonlyError) {
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

const emptyObjectSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {},
} as const;
const paramsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId'],
  properties: { projectId: { type: 'string', minLength: 1 } },
} as const;
const serviceParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['serviceId'],
  properties: {
    serviceId: { type: 'string', minLength: 1, maxLength: 80 },
  },
} as const;
const emptyQuery = {
  type: 'object',
  additionalProperties: false,
  properties: {},
} as const;
const explorerConnectionProperties = {
  driver: {
    type: 'string',
    enum: ['mysql', 'mariadb', 'postgresql'],
  },
  host: { type: 'string', minLength: 1, maxLength: 255 },
  port: { type: 'integer', minimum: 1, maximum: 65535 },
  username: { type: 'string', maxLength: 128 },
  password: { type: 'string', maxLength: 4096 },
  database: { type: 'string', maxLength: 128 },
} as const;
const explorerBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['driver'],
  properties: explorerConnectionProperties,
} as const;
const explorerPreviewBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['driver', 'table'],
  properties: {
    ...explorerConnectionProperties,
    schema: { type: 'string', minLength: 1, maxLength: 128 },
    table: { type: 'string', minLength: 1, maxLength: 128 },
  },
} as const;
const explorerQueryBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['driver', 'query'],
  properties: {
    ...explorerConnectionProperties,
    query: { type: 'string', minLength: 1, maxLength: 4000 },
  },
} as const;
const explorerErrorResponseSchemas = {
  ...commonErrorResponseSchemas,
  499: apiErrorResponseSchema,
  502: apiErrorResponseSchema,
  503: apiErrorResponseSchema,
} as const;
const requireProject = (store: ProjectStore, id: string) => {
  const project = store.findProject(id);
  if (!project)
    throw new ApiError({
      statusCode: 404,
      code: 'PROJECT_NOT_FOUND',
      message: 'Projeto não encontrado.',
    });
  return project;
};

export const databaseRoutes: FastifyPluginAsync<Options> = async (
  app,
  options,
) => {
  app.get(
    '/database',
    {
      schema: {
        params: emptyObjectSchema,
        querystring: emptyQuery,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['services'],
            properties: {
              services: {
                type: 'array',
                items: machineDatabaseServiceResponseSchema,
              },
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async () => ({
      services: await options.databaseDetectionService.getMachineServices(),
    }),
  );

  app.get<{ Params: { serviceId: string } }>(
    '/database/:serviceId/details',
    {
      schema: {
        params: serviceParamsSchema,
        querystring: emptyQuery,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['details'],
            properties: {
              details: machineDatabaseServiceDetailsResponseSchema,
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => ({
      details: await options.databaseDetectionService.getMachineServiceDetails(
        request.params.serviceId,
      ),
    }),
  );

  app.post<{ Body: ExplorerBody }>(
    '/database/explorer/catalog',
    {
      schema: {
        params: emptyObjectSchema,
        querystring: emptyQuery,
        body: explorerBodySchema,
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
          ...explorerErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      const abortScope = createHttpAbortScope(request.raw, reply.raw);
      try {
        return {
          databases: await options.databaseReadonlyService.listDatabases(
            request.body,
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
  app.post<{ Body: ExplorerBody }>(
    '/database/explorer/tables',
    {
      schema: {
        params: emptyObjectSchema,
        querystring: emptyQuery,
        body: explorerBodySchema,
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
          ...explorerErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      const abortScope = createHttpAbortScope(request.raw, reply.raw);
      try {
        return {
          tables: await options.databaseReadonlyService.listTables(
            request.body,
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
  app.post<{ Body: ExplorerPreviewBody }>(
    '/database/explorer/preview',
    {
      schema: {
        params: emptyObjectSchema,
        querystring: emptyQuery,
        body: explorerPreviewBodySchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['result'],
            properties: {
              result: machineDatabaseQueryResultResponseSchema,
            },
          },
          ...explorerErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      const abortScope = createHttpAbortScope(request.raw, reply.raw);
      try {
        return {
          result: await options.databaseReadonlyService.preview(
            request.body,
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
  app.post<{ Body: ExplorerQueryBody }>(
    '/database/explorer/query',
    {
      schema: {
        params: emptyObjectSchema,
        querystring: emptyQuery,
        body: explorerQueryBodySchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['result'],
            properties: {
              result: machineDatabaseQueryResultResponseSchema,
            },
          },
          ...explorerErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      const abortScope = createHttpAbortScope(request.raw, reply.raw);
      try {
        return {
          result: await options.databaseReadonlyService.query(
            request.body,
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

  for (const action of ['start', 'stop', 'restart'] as const) {
    app.post<{ Params: { serviceId: string } }>(
      `/database/:serviceId/${action}`,
      {
        schema: {
          params: serviceParamsSchema,
          querystring: emptyQuery,
          body: emptyObjectSchema,
          response: {
            200: {
              type: 'object',
              additionalProperties: false,
              required: ['action', 'succeeded'],
              properties: {
                action: {
                  type: 'string',
                  enum: ['start', 'stop', 'restart'],
                },
                succeeded: { type: 'boolean' },
              },
            },
            ...commonErrorResponseSchemas,
          },
        },
      },
      async (request) => {
        try {
          await options.databaseDetectionService.runMachineServiceAction(
            request.params.serviceId,
            action,
          );
          return { action, succeeded: true };
        } catch (error) {
          request.log.warn(
            { error, serviceId: request.params.serviceId, action },
            'Machine database service action failed',
          );
          const message =
            error instanceof DatabaseServiceActionError
              ? databaseServiceActionErrorMessage(error)
              : 'Não foi possível alterar o serviço de banco de dados.';
          const statusCode =
            error instanceof DatabaseServiceActionError &&
            error.reason === 'conflicting-service-active'
              ? 409
              : 500;
          throw new ApiError({
            statusCode,
            code: 'DATABASE_SERVICE_ACTION_FAILED',
            message,
          });
        }
      },
    );
  }

  for (const operation of ['install', 'uninstall'] as const) {
    app.post<{ Params: { serviceId: string } }>(
      `/database/:serviceId/${operation}`,
      {
        schema: {
          params: serviceParamsSchema,
          querystring: emptyQuery,
          body: emptyObjectSchema,
          response: {
            200: {
              type: 'object',
              additionalProperties: false,
              required: [operation === 'install' ? 'installed' : 'uninstalled'],
              properties: {
                [operation === 'install' ? 'installed' : 'uninstalled']: {
                  type: 'boolean',
                },
              },
            },
            ...commonErrorResponseSchemas,
          },
        },
      },
      async (request) => {
        try {
          if (operation === 'install') {
            await options.databaseDetectionService.installMachineService(
              request.params.serviceId,
            );
          } else {
            await options.databaseDetectionService.uninstallMachineService(
              request.params.serviceId,
            );
          }
          return {
            [operation === 'install' ? 'installed' : 'uninstalled']: true,
          };
        } catch (error) {
          request.log.warn(
            { error, serviceId: request.params.serviceId, operation },
            `Machine database service ${operation} failed`,
          );
          const message =
            error instanceof DatabaseServicePackageError
              ? databaseServicePackageErrorMessage(error)
              : `Não foi possível ${operation === 'install' ? 'instalar' : 'desinstalar'} o serviço de banco de dados.`;
          throw new ApiError({
            statusCode: 500,
            code: 'DATABASE_SERVICE_PACKAGE_FAILED',
            message,
          });
        }
      },
    );
  }

  app.get<{ Params: Params; Querystring: Query }>(
    '/projects/:projectId/database',
    {
      schema: {
        params: paramsSchema,
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            page: { type: 'integer', minimum: 1, maximum: 10000 },
            pageSize: { type: 'integer', minimum: 1, maximum: 50 },
          },
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['database'],
            properties: { database: projectDatabaseOverviewResponseSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => ({
      database: await options.databaseDetectionService.getOverview(
        requireProject(options.projectStore, request.params.projectId),
        request.query.page,
        request.query.pageSize,
      ),
    }),
  );

  app.post<{ Params: SecretParams }>(
    '/projects/:projectId/database/:environmentId/reveal',
    {
      schema: {
        params: {
          type: 'object',
          additionalProperties: false,
          required: ['projectId', 'environmentId'],
          properties: {
            projectId: { type: 'string', minLength: 1 },
            environmentId: { type: 'string', minLength: 1, maxLength: 120 },
          },
        },
        body: { type: 'object', additionalProperties: false, properties: {} },
        querystring: emptyQuery,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['secret'],
            properties: {
              secret: {
                type: 'object',
                additionalProperties: false,
                required: ['environmentId', 'databaseUrl'],
                properties: {
                  environmentId: { type: 'string' },
                  databaseUrl: { type: 'string' },
                },
              },
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const databaseUrl = await options.databaseDetectionService.reveal(
        requireProject(options.projectStore, request.params.projectId),
        request.params.environmentId,
      );
      if (!databaseUrl)
        throw new ApiError({
          statusCode: 404,
          code: 'DATABASE_ENVIRONMENT_NOT_FOUND',
          message: 'Configuração de banco não encontrada.',
        });
      return {
        secret: { environmentId: request.params.environmentId, databaseUrl },
      };
    },
  );

  for (const action of ['start', 'stop', 'restart'] as const) {
    app.post<{ Params: SecretParams }>(
      `/projects/:projectId/database/:environmentId/${action}`,
      {
        schema: {
          params: {
            type: 'object',
            additionalProperties: false,
            required: ['projectId', 'environmentId'],
            properties: {
              projectId: { type: 'string', minLength: 1 },
              environmentId: { type: 'string', minLength: 1, maxLength: 120 },
            },
          },
          body: { type: 'object', additionalProperties: false, properties: {} },
          querystring: emptyQuery,
          response: {
            200: {
              type: 'object',
              additionalProperties: false,
              required: ['action'],
              properties: {
                action: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['environmentId', 'action', 'succeeded'],
                  properties: {
                    environmentId: { type: 'string' },
                    action: {
                      type: 'string',
                      enum: ['start', 'stop', 'restart'],
                    },
                    succeeded: { type: 'boolean' },
                  },
                },
              },
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
        try {
          const succeeded = await options.databaseDetectionService[action](
            project,
            request.params.environmentId,
          );
          if (!succeeded)
            throw new ApiError({
              statusCode: 409,
              code: 'DATABASE_SERVICE_ACTION_NOT_AVAILABLE',
              message: 'Não há um serviço local reconhecido para este banco.',
            });
          return {
            action: {
              environmentId: request.params.environmentId,
              action,
              succeeded: true,
            },
          };
        } catch (error) {
          if (error instanceof ApiError) throw error;
          request.log.warn(
            {
              error,
              projectId: project.id,
              environmentId: request.params.environmentId,
              action,
            },
            'Database service action failed',
          );
          throw new ApiError({
            statusCode: 500,
            code: 'DATABASE_SERVICE_ACTION_FAILED',
            message:
              error instanceof DatabaseServiceActionError
                ? databaseServiceActionErrorMessage(error)
                : 'O systemctl não conseguiu alterar o serviço local de banco de dados. Consulte o log da API.',
          });
        }
      },
    );
  }

  const snapshotParamsSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['projectId', 'snapshotId'],
    properties: {
      projectId: { type: 'string', minLength: 1 },
      snapshotId: {
        type: 'string',
        pattern:
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      },
    },
  } as const;

  const snapshotStatuses: Record<string, number> = {
    DATABASE_ENVIRONMENT_NOT_FOUND: 404,
    DATABASE_SNAPSHOT_NOT_FOUND: 404,
    DATABASE_SNAPSHOT_UNSUPPORTED: 409,
    DATABASE_SNAPSHOT_TOOL_MISSING: 409,
    DATABASE_SNAPSHOT_TOO_LARGE: 409,
    DATABASE_RESTORE_CONFIRMATION_REQUIRED: 409,
    DATABASE_SNAPSHOT_FAILED: 500,
    DATABASE_RESTORE_FAILED: 500,
  };

  const asApiError = (error: unknown): never => {
    if (error instanceof ApiError) throw error;
    if (error instanceof DatabaseSnapshotError) {
      throw new ApiError({
        statusCode: snapshotStatuses[error.code] ?? 500,
        code: error.code,
        message: error.message,
      });
    }
    throw new ApiError({
      statusCode: 500,
      code: 'DATABASE_SNAPSHOT_FAILED',
      message:
        error instanceof Error
          ? error.message
          : 'Falha na operação de snapshot.',
    });
  };

  app.get<{ Params: Params }>(
    '/projects/:projectId/database/snapshots',
    {
      schema: {
        params: paramsSchema,
        querystring: emptyQuery,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['snapshots'],
            properties: { snapshots: databaseSnapshotListResponseSchema },
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
      try {
        return {
          snapshots: await options.databaseSnapshotService.list(project),
        };
      } catch (error) {
        return asApiError(error);
      }
    },
  );

  app.post<{ Params: Params; Body: { environmentId: string } }>(
    '/projects/:projectId/database/snapshots',
    {
      schema: {
        params: paramsSchema,
        querystring: emptyQuery,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['environmentId'],
          properties: {
            environmentId: { type: 'string', minLength: 1, maxLength: 120 },
          },
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['snapshot'],
            properties: { snapshot: databaseSnapshotResponseSchema },
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
      try {
        return {
          snapshot: await options.databaseSnapshotService.create(
            project,
            request.body.environmentId,
          ),
        };
      } catch (error) {
        request.log.warn({ projectId: project.id }, 'Database snapshot failed');
        return asApiError(error);
      }
    },
  );

  app.post<{ Params: Params & { snapshotId: string } }>(
    '/projects/:projectId/database/snapshots/:snapshotId/restore/confirmation',
    {
      schema: {
        params: snapshotParamsSchema,
        querystring: emptyQuery,
        body: { type: 'object', additionalProperties: false, properties: {} },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['confirmation'],
            properties: {
              confirmation: databaseSnapshotConfirmationResponseSchema,
            },
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
      try {
        return {
          confirmation: await options.databaseSnapshotService.prepareRestore(
            project,
            request.params.snapshotId,
          ),
        };
      } catch (error) {
        return asApiError(error);
      }
    },
  );

  app.post<{
    Params: Params & { snapshotId: string };
    Body: { confirmationToken: string };
  }>(
    '/projects/:projectId/database/snapshots/:snapshotId/restore',
    {
      schema: {
        params: snapshotParamsSchema,
        querystring: emptyQuery,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['confirmationToken'],
          properties: {
            confirmationToken: { type: 'string', minLength: 64, maxLength: 64 },
          },
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['restore'],
            properties: { restore: databaseRestoreResultResponseSchema },
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
      try {
        await options.databaseSnapshotService.restore(
          project,
          request.params.snapshotId,
          request.body.confirmationToken,
        );
        return {
          restore: { snapshotId: request.params.snapshotId, restored: true },
        };
      } catch (error) {
        request.log.warn({ projectId: project.id }, 'Database restore failed');
        return asApiError(error);
      }
    },
  );
};
