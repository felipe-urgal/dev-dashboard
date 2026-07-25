import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';
import type { ProjectScriptOrigin, ProjectScriptRisk } from '@dev-dashboard/contracts';
import { ApiError } from '../http/api-error.js';
import { commonErrorResponseSchemas, latestScriptExecutionResponseSchema, projectScriptCatalogResponseSchema, scriptExecutionConfirmationResponseSchema, scriptExecutionLogResponseSchema, scriptExecutionResponseSchema } from '../http/response-schemas.js';
import type { ScriptDetectionService } from '../services/script-detection-service.js';
import { ScriptExecutionError, type ScriptExecutionService } from '../services/script-execution-service.js';
import type { ProjectStore } from '../store/project-store.js';

interface Params { projectId: string }
interface Query { page?: number; pageSize?: number; search?: string; origin?: ProjectScriptOrigin; risk?: ProjectScriptRisk }
interface StartBody { actionId: string; confirmationToken?: string }
interface ExecutionParams extends Params { executionId: string }
interface Options extends FastifyPluginOptions { projectStore: ProjectStore; scriptDetectionService: ScriptDetectionService; scriptExecutionService: ScriptExecutionService }

const executionParamsSchema = { type: 'object', additionalProperties: false, required: ['projectId', 'executionId'], properties: { projectId: { type: 'string', minLength: 1 }, executionId: { type: 'string', minLength: 1 } } } as const;

function translate(error: unknown): never {
  if (!(error instanceof ScriptExecutionError)) throw error;
  const statuses: Record<string, number> = { SCRIPT_NOT_FOUND: 404, SCRIPT_EXECUTION_NOT_FOUND: 404, SCRIPT_DISABLED: 409, SCRIPT_CONFIRMATION_REQUIRED: 409, SCRIPT_ALREADY_RUNNING: 409, SCRIPT_MANAGER_AMBIGUOUS: 409, SCRIPT_MANAGER_NOT_FOUND: 409 };
  throw new ApiError({ statusCode: statuses[error.code] ?? 500, code: error.code, message: error.message });
}

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

  app.post<{ Params: Params; Body: { actionId: string } }>('/projects/:projectId/scripts/confirmations', { schema: {
    params: { type: 'object', additionalProperties: false, required: ['projectId'], properties: { projectId: { type: 'string', minLength: 1 } } },
    body: { type: 'object', additionalProperties: false, required: ['actionId'], properties: { actionId: { type: 'string', minLength: 1, maxLength: 200 } } },
    response: { 201: { type: 'object', additionalProperties: false, required: ['confirmation'], properties: { confirmation: scriptExecutionConfirmationResponseSchema } }, ...commonErrorResponseSchemas },
  } }, async (request, reply) => {
    const project = options.projectStore.findProject(request.params.projectId);
    if (!project) throw new ApiError({ statusCode: 404, code: 'PROJECT_NOT_FOUND', message: 'Projeto não encontrado.' });
    try { return reply.code(201).send({ confirmation: await options.scriptExecutionService.prepareConfirmation(project, request.body.actionId) }); } catch (error) { translate(error); }
  });

  app.post<{ Params: Params; Body: StartBody }>('/projects/:projectId/scripts/executions', { schema: {
    params: { type: 'object', additionalProperties: false, required: ['projectId'], properties: { projectId: { type: 'string', minLength: 1 } } },
    body: { type: 'object', additionalProperties: false, required: ['actionId'], properties: { actionId: { type: 'string', minLength: 1, maxLength: 200 }, confirmationToken: { type: 'string', minLength: 64, maxLength: 64 } } },
    response: { 201: { type: 'object', additionalProperties: false, required: ['execution'], properties: { execution: scriptExecutionResponseSchema } }, ...commonErrorResponseSchemas },
  } }, async (request, reply) => {
    const project = options.projectStore.findProject(request.params.projectId);
    if (!project) throw new ApiError({ statusCode: 404, code: 'PROJECT_NOT_FOUND', message: 'Projeto não encontrado.' });
    try { return reply.code(201).send({ execution: await options.scriptExecutionService.start(project, request.body.actionId, request.body.confirmationToken) }); } catch (error) { translate(error); }
  });

  app.get<{ Params: Params }>('/projects/:projectId/scripts/executions/latest', { schema: {
    params: { type: 'object', additionalProperties: false, required: ['projectId'], properties: { projectId: { type: 'string', minLength: 1 } } },
    response: { 200: latestScriptExecutionResponseSchema, ...commonErrorResponseSchemas },
  } }, async (request) => {
    const project = options.projectStore.findProject(request.params.projectId);
    if (!project) throw new ApiError({ statusCode: 404, code: 'PROJECT_NOT_FOUND', message: 'Projeto não encontrado.' });
    return { execution: options.scriptExecutionService.latest(project.id) };
  });

  app.get<{ Params: ExecutionParams }>('/projects/:projectId/scripts/executions/:executionId', { schema: { params: executionParamsSchema, response: { 200: { type: 'object', additionalProperties: false, required: ['execution'], properties: { execution: scriptExecutionResponseSchema } }, ...commonErrorResponseSchemas } } }, async (request) => {
    try { return { execution: options.scriptExecutionService.get(request.params.projectId, request.params.executionId) }; } catch (error) { translate(error); }
  });
  app.get<{ Params: ExecutionParams }>('/projects/:projectId/scripts/executions/:executionId/log', { schema: { params: executionParamsSchema, response: { 200: { type: 'object', additionalProperties: false, required: ['log'], properties: { log: scriptExecutionLogResponseSchema } }, ...commonErrorResponseSchemas } } }, async (request) => {
    try { return { log: await options.scriptExecutionService.log(request.params.projectId, request.params.executionId) }; } catch (error) { translate(error); }
  });
  app.post<{ Params: ExecutionParams }>('/projects/:projectId/scripts/executions/:executionId/cancel', { schema: { params: executionParamsSchema, body: { type: 'object', additionalProperties: false, maxProperties: 0 }, response: { 200: { type: 'object', additionalProperties: false, required: ['execution'], properties: { execution: scriptExecutionResponseSchema } }, ...commonErrorResponseSchemas } } }, async (request) => {
    try { return { execution: await options.scriptExecutionService.cancel(request.params.projectId, request.params.executionId) }; } catch (error) { translate(error); }
  });
};
