import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';
import { ApiError } from '../http/api-error.js';
import { commonErrorResponseSchemas, projectDatabaseOverviewResponseSchema } from '../http/response-schemas.js';
import { DatabaseStartError, type DatabaseDetectionService } from '../services/database-detection-service.js';
import type { ProjectStore } from '../store/project-store.js';

interface Options extends FastifyPluginOptions { projectStore: ProjectStore; databaseDetectionService: DatabaseDetectionService }
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

  app.post<{ Params: SecretParams }>('/projects/:projectId/database/:environmentId/start', {
    schema: {
      params: { type: 'object', additionalProperties: false, required: ['projectId', 'environmentId'], properties: { projectId: { type: 'string', minLength: 1 }, environmentId: { type: 'string', minLength: 1, maxLength: 120 } } },
      body: { type: 'object', additionalProperties: false, properties: {} }, querystring: emptyQuery,
      response: {
        200: {
          type: 'object', additionalProperties: false, required: ['start'],
          properties: {
            start: {
              type: 'object', additionalProperties: false, required: ['environmentId', 'started'],
              properties: { environmentId: { type: 'string' }, started: { type: 'boolean' } },
            },
          },
        },
        ...commonErrorResponseSchemas,
      },
    },
  }, async (request) => {
    const project = requireProject(options.projectStore, request.params.projectId);
    try {
      const started = await options.databaseDetectionService.start(project, request.params.environmentId);
      if (!started) throw new ApiError({ statusCode: 409, code: 'DATABASE_START_NOT_AVAILABLE', message: 'Não há um serviço local reconhecido para este banco.' });
      return { start: { environmentId: request.params.environmentId, started: true } };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      request.log.warn({ error, projectId: project.id, environmentId: request.params.environmentId }, 'Database service start failed');
      const messages = {
        'systemctl-unavailable': 'O systemctl não está instalado ou disponível para iniciar o serviço local.',
        'sudo-auth-required': 'O sudo precisa de autorização. Execute sudo -v no terminal e tente novamente.',
        'permission-denied': 'O usuário da API não tem permissão para iniciar o serviço local de banco.',
        'command-failed': 'O systemctl não conseguiu iniciar o serviço local de banco de dados. Consulte o log da API.',
      } as const;
      throw new ApiError({
        statusCode: 500,
        code: 'DATABASE_START_FAILED',
        message: error instanceof DatabaseStartError ? messages[error.reason] : messages['command-failed'],
      });
    }
  });
};
