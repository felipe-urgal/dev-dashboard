import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';
import { ApiError } from '../http/api-error.js';
import {
  commonErrorResponseSchemas,
  databaseRestoreResultResponseSchema,
  databaseSnapshotConfirmationResponseSchema,
  databaseSnapshotListResponseSchema,
  databaseSnapshotResponseSchema,
  projectDatabaseOverviewResponseSchema,
} from '../http/response-schemas.js';
import { DatabaseServiceActionError, type DatabaseDetectionService, type DatabaseServiceAction } from '../services/database-detection-service.js';
import { DatabaseSnapshotError, type DatabaseSnapshotService } from '../services/database-snapshot-service.js';
import { DockerComposeError } from '../services/docker-compose-service.js';
import type { ProjectStore } from '../store/project-store.js';

interface Options extends FastifyPluginOptions {
  projectStore: ProjectStore;
  databaseDetectionService: DatabaseDetectionService;
  databaseSnapshotService: DatabaseSnapshotService;
}
interface Params { projectId: string }
interface SecretParams extends Params { environmentId: string }
interface Query { page?: number; pageSize?: number }

const paramsSchema = { type: 'object', additionalProperties: false, required: ['projectId'], properties: { projectId: { type: 'string', minLength: 1 } } } as const;
const emptyQuery = { type: 'object', additionalProperties: false, properties: {} } as const;
const requireProject = (store: ProjectStore, id: string) => {
  const project = store.findProject(id);
  if (!project) throw new ApiError({ statusCode: 404, code: 'PROJECT_NOT_FOUND', message: 'Projeto não encontrado.' });
  return project;
};

export const databaseRoutes: FastifyPluginAsync<Options> = async (app, options) => {
  app.get<{ Params: Params; Querystring: Query }>('/projects/:projectId/database', {
    schema: { params: paramsSchema, querystring: { type: 'object', additionalProperties: false, properties: { page: { type: 'integer', minimum: 1, maximum: 10000 }, pageSize: { type: 'integer', minimum: 1, maximum: 50 } } }, response: { 200: { type: 'object', additionalProperties: false, required: ['database'], properties: { database: projectDatabaseOverviewResponseSchema } }, ...commonErrorResponseSchemas } },
  }, async (request) => ({ database: await options.databaseDetectionService.getOverview(requireProject(options.projectStore, request.params.projectId), request.query.page, request.query.pageSize) }));

  app.post<{ Params: SecretParams }>('/projects/:projectId/database/:environmentId/reveal', {
    schema: {
      params: { type: 'object', additionalProperties: false, required: ['projectId', 'environmentId'], properties: { projectId: { type: 'string', minLength: 1 }, environmentId: { type: 'string', minLength: 1, maxLength: 120 } } },
      body: { type: 'object', additionalProperties: false, properties: {} }, querystring: emptyQuery,
      response: {
        200: {
          type: 'object', additionalProperties: false, required: ['secret'],
          properties: {
            secret: {
              type: 'object', additionalProperties: false, required: ['environmentId', 'databaseUrl'],
              properties: { environmentId: { type: 'string' }, databaseUrl: { type: 'string' } },
            },
          },
        },
        ...commonErrorResponseSchemas,
      },
    },
  }, async (request) => {
    const databaseUrl = await options.databaseDetectionService.reveal(requireProject(options.projectStore, request.params.projectId), request.params.environmentId);
    if (!databaseUrl) throw new ApiError({ statusCode: 404, code: 'DATABASE_ENVIRONMENT_NOT_FOUND', message: 'Configuração de banco não encontrada.' });
    return { secret: { environmentId: request.params.environmentId, databaseUrl } };
  });

  const serviceActionVerbs: Record<DatabaseServiceAction, string> = { start: 'iniciar', stop: 'parar', restart: 'reiniciar' };

  for (const action of ['start', 'stop', 'restart'] as const) {
    app.post<{ Params: SecretParams }>(`/projects/:projectId/database/:environmentId/${action}`, {
      schema: {
        params: { type: 'object', additionalProperties: false, required: ['projectId', 'environmentId'], properties: { projectId: { type: 'string', minLength: 1 }, environmentId: { type: 'string', minLength: 1, maxLength: 120 } } },
        body: { type: 'object', additionalProperties: false, properties: {} }, querystring: emptyQuery,
        response: {
          200: {
            type: 'object', additionalProperties: false, required: ['action'],
            properties: {
              action: {
                type: 'object', additionalProperties: false, required: ['environmentId', 'action', 'succeeded'],
                properties: {
                  environmentId: { type: 'string' },
                  action: { type: 'string', enum: ['start', 'stop', 'restart'] },
                  succeeded: { type: 'boolean' },
                },
              },
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    }, async (request) => {
      const project = requireProject(options.projectStore, request.params.projectId);
      try {
        const succeeded = await options.databaseDetectionService[action](project, request.params.environmentId);
        if (!succeeded) throw new ApiError({ statusCode: 409, code: 'DATABASE_SERVICE_ACTION_NOT_AVAILABLE', message: 'Não há um serviço local reconhecido para este banco.' });
        return { action: { environmentId: request.params.environmentId, action, succeeded: true } };
      } catch (error) {
        if (error instanceof ApiError) throw error;
        request.log.warn({ error, projectId: project.id, environmentId: request.params.environmentId, action }, 'Database service action failed');
        const messages = {
          'systemctl-unavailable': `O systemctl não está instalado ou disponível para ${serviceActionVerbs[action]} o serviço local.`,
          'authorization-unavailable': 'Não há um agente de autenticação polkit disponível na sessão. Inicie um agente polkit e tente novamente.',
          'permission-denied': `A autorização para ${serviceActionVerbs[action]} o serviço local de banco foi negada.`,
          'command-failed': `O systemctl não conseguiu ${serviceActionVerbs[action]} o serviço local de banco de dados. Consulte o log da API.`,
        } as const;
        throw new ApiError({
          statusCode: 500,
          code: 'DATABASE_SERVICE_ACTION_FAILED',
          message: error instanceof DockerComposeError
            ? error.message
            : error instanceof DatabaseServiceActionError
              ? messages[error.reason]
              : messages['command-failed'],
        });
      }
    });
  }

  const snapshotParamsSchema = {
    type: 'object', additionalProperties: false, required: ['projectId', 'snapshotId'],
    properties: {
      projectId: { type: 'string', minLength: 1 },
      // Só o formato de UUID gerado pela própria API é aceito.
      snapshotId: {
        type: 'string',
        pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
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
      message: error instanceof Error ? error.message : 'Falha na operação de snapshot.',
    });
  };

  app.get<{ Params: Params }>('/projects/:projectId/database/snapshots', {
    schema: {
      params: paramsSchema, querystring: emptyQuery,
      response: {
        200: {
          type: 'object', additionalProperties: false, required: ['snapshots'],
          properties: { snapshots: databaseSnapshotListResponseSchema },
        },
        ...commonErrorResponseSchemas,
      },
    },
  }, async (request) => {
    const project = requireProject(options.projectStore, request.params.projectId);
    try {
      return { snapshots: await options.databaseSnapshotService.list(project) };
    } catch (error) {
      return asApiError(error);
    }
  });

  app.post<{ Params: Params; Body: { environmentId: string } }>('/projects/:projectId/database/snapshots', {
    schema: {
      params: paramsSchema, querystring: emptyQuery,
      body: {
        type: 'object', additionalProperties: false, required: ['environmentId'],
        properties: { environmentId: { type: 'string', minLength: 1, maxLength: 120 } },
      },
      response: {
        200: {
          type: 'object', additionalProperties: false, required: ['snapshot'],
          properties: { snapshot: databaseSnapshotResponseSchema },
        },
        ...commonErrorResponseSchemas,
      },
    },
  }, async (request) => {
    const project = requireProject(options.projectStore, request.params.projectId);
    try {
      return { snapshot: await options.databaseSnapshotService.create(project, request.body.environmentId) };
    } catch (error) {
      request.log.warn({ projectId: project.id }, 'Database snapshot failed');
      return asApiError(error);
    }
  });

  app.post<{ Params: Params & { snapshotId: string } }>('/projects/:projectId/database/snapshots/:snapshotId/restore/confirmation', {
    schema: {
      params: snapshotParamsSchema, querystring: emptyQuery,
      body: { type: 'object', additionalProperties: false, properties: {} },
      response: {
        200: {
          type: 'object', additionalProperties: false, required: ['confirmation'],
          properties: { confirmation: databaseSnapshotConfirmationResponseSchema },
        },
        ...commonErrorResponseSchemas,
      },
    },
  }, async (request) => {
    const project = requireProject(options.projectStore, request.params.projectId);
    try {
      return {
        confirmation: await options.databaseSnapshotService.prepareRestore(project, request.params.snapshotId),
      };
    } catch (error) {
      return asApiError(error);
    }
  });

  app.post<{ Params: Params & { snapshotId: string }; Body: { confirmationToken: string } }>('/projects/:projectId/database/snapshots/:snapshotId/restore', {
    schema: {
      params: snapshotParamsSchema, querystring: emptyQuery,
      body: {
        type: 'object', additionalProperties: false, required: ['confirmationToken'],
        properties: { confirmationToken: { type: 'string', minLength: 64, maxLength: 64 } },
      },
      response: {
        200: {
          type: 'object', additionalProperties: false, required: ['restore'],
          properties: { restore: databaseRestoreResultResponseSchema },
        },
        ...commonErrorResponseSchemas,
      },
    },
  }, async (request) => {
    const project = requireProject(options.projectStore, request.params.projectId);
    try {
      await options.databaseSnapshotService.restore(project, request.params.snapshotId, request.body.confirmationToken);
      return { restore: { snapshotId: request.params.snapshotId, restored: true } };
    } catch (error) {
      request.log.warn({ projectId: project.id }, 'Database restore failed');
      return asApiError(error);
    }
  });
};
