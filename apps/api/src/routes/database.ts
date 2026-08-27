import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';
import { ApiError } from '../http/api-error.js';
import { createHttpAbortScope } from '../http/request-abort.js';
import {
  commonErrorResponseSchemas,
  databaseRestoreResultResponseSchema,
  databaseSnapshotConfirmationResponseSchema,
  databaseSnapshotListResponseSchema,
  databaseSnapshotResponseSchema,
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

function explorerErrorResponse(error: unknown): {
  statusCode: number;
  message: string;
} {
  if (!(error instanceof DatabaseReadonlyError)) {
    return {
      statusCode: 500,
      message: 'Não foi possível consultar o banco de dados.',
    };
  }
  return {
    statusCode:
      error.reason === 'aborted'
        ? 499
        : error.reason === 'client-unavailable'
          ? 503
          : error.reason === 'command-failed'
            ? 502
            : 400,
    message: error.message,
  };
}

const paramsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId'],
  properties: { projectId: { type: 'string', minLength: 1 } },
} as const;
const emptyQuery = {
  type: 'object',
  additionalProperties: false,
  properties: {},
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
  app.get('/database', async () => ({
    services: await options.databaseDetectionService.getMachineServices(),
  }));

  app.get<{ Params: { serviceId: string } }>(
    '/database/:serviceId/details',
    async (request) => ({
      details: await options.databaseDetectionService.getMachineServiceDetails(
        request.params.serviceId,
      ),
    }),
  );

  app.post<{ Body: ExplorerBody }>(
    '/database/explorer/catalog',
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
        const response = explorerErrorResponse(error);
        return reply
          .code(response.statusCode)
          .send({ message: response.message });
      } finally {
        abortScope.dispose();
      }
    },
  );
  app.post<{ Body: ExplorerBody }>(
    '/database/explorer/tables',
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
        const response = explorerErrorResponse(error);
        return reply
          .code(response.statusCode)
          .send({ message: response.message });
      } finally {
        abortScope.dispose();
      }
    },
  );
  app.post<{ Body: ExplorerPreviewBody }>(
    '/database/explorer/preview',
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
        const response = explorerErrorResponse(error);
        return reply
          .code(response.statusCode)
          .send({ message: response.message });
      } finally {
        abortScope.dispose();
      }
    },
  );
  app.post<{ Body: ExplorerQueryBody }>(
    '/database/explorer/query',
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
        const response = explorerErrorResponse(error);
        return reply
          .code(response.statusCode)
          .send({ message: response.message });
      } finally {
        abortScope.dispose();
      }
    },
  );

  for (const action of ['start', 'stop', 'restart'] as const) {
    app.post<{ Params: { serviceId: string } }>(
      `/database/:serviceId/${action}`,
      async (request, reply) => {
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
          return reply.code(statusCode).send({ message });
        }
      },
    );
  }

  for (const operation of ['install', 'uninstall'] as const) {
    app.post<{ Params: { serviceId: string } }>(
      `/database/:serviceId/${operation}`,
      async (request, reply) => {
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
          return reply.code(500).send({ message });
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
