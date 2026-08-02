import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';
import type { ProjectScriptOrigin, ProjectScriptRisk, ScriptExecutionEvent, ScriptExecutionVariables } from '@dev-dashboard/contracts';
import { ApiError } from '../http/api-error.js';
import { commonErrorResponseSchemas, latestScriptExecutionResponseSchema, projectScriptCatalogResponseSchema, scriptExecutionConfirmationResponseSchema, scriptExecutionHistoryResponseSchema, scriptExecutionLogResponseSchema, scriptExecutionResponseSchema } from '../http/response-schemas.js';
import type { ScriptDetectionService } from '../services/script-detection-service.js';
import { ScriptExecutionError, type ScriptExecutionService } from '../services/script-execution-service.js';
import type { ProjectStore } from '../store/project-store.js';

interface Params { projectId: string }
interface Query { page?: number; pageSize?: number; search?: string; origin?: ProjectScriptOrigin; risk?: ProjectScriptRisk }
interface StartBody { actionId: string; confirmationToken?: string; variables?: ScriptExecutionVariables }
interface ExecutionParams extends Params { executionId: string }
interface Options extends FastifyPluginOptions { projectStore: ProjectStore; scriptDetectionService: ScriptDetectionService; scriptExecutionService: ScriptExecutionService }

const executionParamsSchema = { type: 'object', additionalProperties: false, required: ['projectId', 'executionId'], properties: { projectId: { type: 'string', minLength: 1 }, executionId: { type: 'string', minLength: 1 } } } as const;
const variablesSchema = {
  type: 'object',
  additionalProperties: { type: 'string', maxLength: 4096, pattern: '^[^\\u0000\\r\\n]*$' },
  propertyNames: { pattern: '^[A-Z][A-Z0-9_]{0,63}$' },
  maxProperties: 20,
} as const;

function serializeEvent(event: ScriptExecutionEvent): string {
  if (event.type === 'state') {
    const execution = event.execution;
    return JSON.stringify({ type: 'state', execution: {
      id: execution.id, projectId: execution.projectId, actionId: execution.actionId,
      actionName: execution.actionName, risk: execution.risk, status: execution.status,
      startedAt: execution.startedAt,
      ...(execution.finishedAt !== undefined ? { finishedAt: execution.finishedAt } : {}),
      ...(execution.exitCode !== undefined ? { exitCode: execution.exitCode } : {}),
    } });
  }
  const log = event.log;
  return JSON.stringify({ type: 'log', log: {
    executionId: log.executionId, content: log.content, truncated: log.truncated,
    masked: log.masked, redactionCount: log.redactionCount,
  } });
}

function translate(error: unknown): never {
  if (!(error instanceof ScriptExecutionError)) throw error;
  const statuses: Record<string, number> = { SCRIPT_NOT_FOUND: 404, SCRIPT_EXECUTION_NOT_FOUND: 404, SCRIPT_VARIABLES_INVALID: 400, SCRIPT_DISABLED: 409, SCRIPT_CONFIRMATION_REQUIRED: 409, SCRIPT_ALREADY_RUNNING: 409, SCRIPT_MANAGER_AMBIGUOUS: 409, SCRIPT_MANAGER_NOT_FOUND: 409, SCRIPT_SUBSCRIBER_LIMIT: 429 };
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

  app.post<{ Params: Params; Body: { actionId: string; variables?: ScriptExecutionVariables } }>('/projects/:projectId/scripts/confirmations', { schema: {
    params: { type: 'object', additionalProperties: false, required: ['projectId'], properties: { projectId: { type: 'string', minLength: 1 } } },
    body: { type: 'object', additionalProperties: false, required: ['actionId'], properties: { actionId: { type: 'string', minLength: 1, maxLength: 200 }, variables: variablesSchema } },
    response: { 201: { type: 'object', additionalProperties: false, required: ['confirmation'], properties: { confirmation: scriptExecutionConfirmationResponseSchema } }, ...commonErrorResponseSchemas },
  } }, async (request, reply) => {
    const project = options.projectStore.findProject(request.params.projectId);
    if (!project) throw new ApiError({ statusCode: 404, code: 'PROJECT_NOT_FOUND', message: 'Projeto não encontrado.' });
    try { return reply.code(201).send({ confirmation: await options.scriptExecutionService.prepareConfirmation(project, request.body.actionId, request.body.variables) }); } catch (error) { translate(error); }
  });

  app.post<{ Params: Params; Body: StartBody }>('/projects/:projectId/scripts/executions', { schema: {
    params: { type: 'object', additionalProperties: false, required: ['projectId'], properties: { projectId: { type: 'string', minLength: 1 } } },
    body: { type: 'object', additionalProperties: false, required: ['actionId'], properties: { actionId: { type: 'string', minLength: 1, maxLength: 200 }, confirmationToken: { type: 'string', minLength: 64, maxLength: 64 }, variables: variablesSchema } },
    response: { 201: { type: 'object', additionalProperties: false, required: ['execution'], properties: { execution: scriptExecutionResponseSchema } }, ...commonErrorResponseSchemas },
  } }, async (request, reply) => {
    const project = options.projectStore.findProject(request.params.projectId);
    if (!project) throw new ApiError({ statusCode: 404, code: 'PROJECT_NOT_FOUND', message: 'Projeto não encontrado.' });
    try { return reply.code(201).send({ execution: await options.scriptExecutionService.start(project, request.body.actionId, request.body.confirmationToken, request.body.variables) }); } catch (error) { translate(error); }
  });

  app.get<{ Params: Params }>('/projects/:projectId/scripts/executions/latest', { schema: {
    params: { type: 'object', additionalProperties: false, required: ['projectId'], properties: { projectId: { type: 'string', minLength: 1 } } },
    response: { 200: latestScriptExecutionResponseSchema, ...commonErrorResponseSchemas },
  } }, async (request) => {
    const project = options.projectStore.findProject(request.params.projectId);
    if (!project) throw new ApiError({ statusCode: 404, code: 'PROJECT_NOT_FOUND', message: 'Projeto não encontrado.' });
    return { execution: await options.scriptExecutionService.latest(project.id) };
  });

  app.get<{ Params: Params; Querystring: { page?: number; pageSize?: number } }>('/projects/:projectId/scripts/executions', { schema: {
    params: { type: 'object', additionalProperties: false, required: ['projectId'], properties: { projectId: { type: 'string', minLength: 1 } } },
    querystring: { type: 'object', additionalProperties: false, properties: { page: { type: 'integer', minimum: 1, default: 1 }, pageSize: { type: 'integer', minimum: 1, maximum: 50, default: 20 } } },
    response: { 200: { type: 'object', additionalProperties: false, required: ['history'], properties: { history: scriptExecutionHistoryResponseSchema } }, ...commonErrorResponseSchemas },
  } }, async (request) => {
    const project = options.projectStore.findProject(request.params.projectId);
    if (!project) throw new ApiError({ statusCode: 404, code: 'PROJECT_NOT_FOUND', message: 'Projeto não encontrado.' });
    return { history: await options.scriptExecutionService.history(project.id, request.query.page, request.query.pageSize) };
  });

  app.get<{ Params: ExecutionParams }>('/projects/:projectId/scripts/executions/:executionId', { schema: { params: executionParamsSchema, response: { 200: { type: 'object', additionalProperties: false, required: ['execution'], properties: { execution: scriptExecutionResponseSchema } }, ...commonErrorResponseSchemas } } }, async (request) => {
    try { return { execution: await options.scriptExecutionService.get(request.params.projectId, request.params.executionId) }; } catch (error) { translate(error); }
  });
  app.get<{ Params: ExecutionParams }>('/projects/:projectId/scripts/executions/:executionId/log', { schema: { params: executionParamsSchema, response: { 200: { type: 'object', additionalProperties: false, required: ['log'], properties: { log: scriptExecutionLogResponseSchema } }, ...commonErrorResponseSchemas } } }, async (request) => {
    try { return { log: await options.scriptExecutionService.log(request.params.projectId, request.params.executionId) }; } catch (error) { translate(error); }
  });
  app.get<{ Params: ExecutionParams }>('/projects/:projectId/scripts/executions/:executionId/events', {
    schema: { params: executionParamsSchema },
  }, async (request, reply) => {
    let unsubscribe = (): void => undefined;
    let heartbeat: NodeJS.Timeout | undefined;
    let connected = false;
    let closeRequested = false;
    const pending: string[] = [];
    const close = (): void => {
      if (!connected) { closeRequested = true; return; }
      if (heartbeat) clearInterval(heartbeat);
      unsubscribe();
      if (!reply.raw.writableEnded) reply.raw.end();
    };
    const write = (frame: string): void => {
      // Não acumulamos snapshots quando o consumidor deixa de acompanhar o ritmo.
      if (!reply.raw.write(frame)) close();
    };
    try {
      unsubscribe = await options.scriptExecutionService.subscribe(request.params.projectId, request.params.executionId, {
        send: (event) => {
          const frame = `event: ${event.type}\ndata: ${serializeEvent(event)}\n\n`;
          if (connected) write(frame);
          else pending.push(frame);
        },
        close,
      });
    } catch (error) {
      translate(error);
    }
    // A autenticação e os limites são validados antes de assumir a resposta contínua.
    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    connected = true;
    for (const frame of pending) write(frame);
    heartbeat = setInterval(() => write(': acompanhamento ativo\n\n'), 15_000);
    heartbeat.unref();
    reply.raw.once('close', close);
    if (closeRequested) close();
  });
  app.post<{ Params: ExecutionParams }>('/projects/:projectId/scripts/executions/:executionId/cancel', { schema: { params: executionParamsSchema, body: { type: 'object', additionalProperties: false, maxProperties: 0 }, response: { 200: { type: 'object', additionalProperties: false, required: ['execution'], properties: { execution: scriptExecutionResponseSchema } }, ...commonErrorResponseSchemas } } }, async (request) => {
    try { return { execution: await options.scriptExecutionService.cancel(request.params.projectId, request.params.executionId) }; } catch (error) { translate(error); }
  });
};
