import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';
import type { ProjectScriptOrigin, ProjectScriptRisk } from '@dev-dashboard/contracts';
import { ApiError } from '../http/api-error.js';
import { commonErrorResponseSchemas, projectScriptCatalogResponseSchema } from '../http/response-schemas.js';
import type { ScriptDetectionService } from '../services/script-detection-service.js';
import type { ProjectStore } from '../store/project-store.js';

interface Params { projectId: string }
interface Query { page?: number; pageSize?: number; search?: string; origin?: ProjectScriptOrigin; risk?: ProjectScriptRisk }
interface Options extends FastifyPluginOptions { projectStore: ProjectStore; scriptDetectionService: ScriptDetectionService }

export const scriptRoutes: FastifyPluginAsync<Options> = async (app, options) => {
  app.get<{ Params: Params; Querystring: Query }>('/projects/:projectId/scripts', { schema: {
    params: { type: 'object', additionalProperties: false, required: ['projectId'], properties: { projectId: { type: 'string', minLength: 1 } } },
    querystring: { type: 'object', additionalProperties: false, properties: {
      page: { type: 'integer', minimum: 1, default: 1 }, pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 20 }, search: { type: 'string', maxLength: 120 },
      origin: { type: 'string', enum: ['package-script', 'rails-task', 'bin'] }, risk: { type: 'string', enum: ['read-only', 'mutable', 'destructive'] },
    } },
    response: { 200: { type: 'object', additionalProperties: false, required: ['catalog'], properties: { catalog: projectScriptCatalogResponseSchema } }, ...commonErrorResponseSchemas },
  } }, async (request) => {
    const project = options.projectStore.findProject(request.params.projectId);
    if (!project) throw new ApiError({ statusCode: 404, code: 'PROJECT_NOT_FOUND', message: 'Projeto não encontrado.' });
    return { catalog: await options.scriptDetectionService.getCatalog(project, request.query) };
  });
};
