import type { FastifyPluginAsync, FastifyRequest } from 'fastify';

import {
  AI_RECOMMENDED_MODELS,
  type AiChatStreamEvent,
  type AiModelPullStreamEvent,
} from '@dev-dashboard/contracts';

import {
  aiApiError,
  aiErrorCode,
  aiProviderErrorResponseSchemas,
} from '../http/ai-error.js';
import { ApiError } from '../http/api-error.js';
import { commonErrorResponseSchemas } from '../http/response-schemas.js';
import type { AiImplementationExecutionService } from '../services/ai-implementation-execution-service.js';
import type { AiProviderResolver } from '../services/ai-provider-resolver.js';
import type { ProjectStore } from '../store/project-store.js';
import { projectParamsSchema, type ProjectParams } from './projects/helpers.js';

interface AiAssistantRouteOptions {
  projectStore: ProjectStore;
  aiProviderResolver: AiProviderResolver;
  aiImplementationExecutionService: AiImplementationExecutionService;
}

interface ChatBody {
  model: string;
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
}

interface CompletionBody {
  model: string;
  prefix: string;
  suffix?: string;
}

interface ModelPullBody {
  model: string;
}

interface ImplementationBody {
  model: string;
  prompt: string;
}

interface ExecutionParams extends ProjectParams {
  executionId: string;
}

const chatMessageSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['role', 'content'],
  properties: {
    role: { type: 'string', enum: ['user', 'assistant', 'system'] },
    content: { type: 'string', minLength: 1, maxLength: 8_000 },
  },
} as const;

const chatBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['model', 'messages'],
  properties: {
    model: { type: 'string', minLength: 1, maxLength: 200 },
    messages: {
      type: 'array',
      minItems: 1,
      maxItems: 40,
      items: chatMessageSchema,
    },
  },
} as const;

const statusSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['available', 'models', 'message'],
  properties: {
    available: { type: 'boolean' },
    baseUrl: { type: 'string' },
    message: { type: 'string' },
    errorCode: { type: 'string' },
    models: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'capabilities'],
        properties: {
          name: { type: 'string' },
          capabilities: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['chat', 'tools', 'fill-in-the-middle'],
            },
          },
        },
      },
    },
  },
} as const;

const completionBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['model', 'prefix'],
  properties: {
    model: { type: 'string', minLength: 1, maxLength: 200 },
    prefix: { type: 'string', maxLength: 4_000 },
    suffix: { type: 'string', maxLength: 1_000 },
  },
} as const;

const completionResultSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['text'],
  properties: { text: { type: 'string' } },
} as const;

const modelPullBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['model'],
  properties: {
    model: {
      type: 'string',
      enum: AI_RECOMMENDED_MODELS.map((model) => model.name),
    },
  },
} as const;

const implementationBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['model', 'prompt'],
  properties: {
    model: { type: 'string', minLength: 1, maxLength: 200 },
    prompt: { type: 'string', minLength: 3, maxLength: 8_000 },
  },
} as const;

const executionParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId', 'executionId'],
  properties: {
    projectId: projectParamsSchema.properties.projectId,
    executionId: { type: 'string', format: 'uuid' },
  },
} as const;

const workspacePreviewSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['confirmationToken', 'files', 'expiresAt'],
  properties: {
    confirmationToken: { type: 'string' },
    expiresAt: { type: 'string' },
    files: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'path',
          'language',
          'beforeVersion',
          'beforeContent',
          'afterContent',
        ],
        properties: {
          path: { type: 'string' },
          language: { type: 'string' },
          beforeVersion: { type: 'string' },
          beforeContent: { type: 'string' },
          afterContent: { type: 'string' },
        },
      },
    },
  },
} as const;

const executionEventSchema = {
  anyOf: [
    {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'content'],
      properties: {
        type: { const: 'message-delta' },
        content: { type: 'string' },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'tool', 'arguments'],
      properties: {
        type: { const: 'tool-call' },
        tool: {
          type: 'string',
          enum: [
            'read_project_file',
            'search_project_text',
            'list_project_files',
            'get_git_diff',
            'propose_workspace_edit',
            'get_symbol_definition',
            'get_symbol_references',
          ],
        },
        arguments: { type: 'object', additionalProperties: true },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'tool', 'ok', 'summary'],
      properties: {
        type: { const: 'tool-result' },
        tool: { type: 'string' },
        ok: { type: 'boolean' },
        summary: { type: 'string' },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'preview'],
      properties: {
        type: { const: 'workspace-edit-proposed' },
        preview: workspacePreviewSchema,
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['type'],
      properties: { type: { const: 'done' } },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'message'],
      properties: {
        type: { const: 'error' },
        message: { type: 'string' },
        code: { type: 'string' },
      },
    },
  ],
} as const;

const executionSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'projectId',
    'provider',
    'mode',
    'model',
    'prompt',
    'status',
    'createdAt',
    'updatedAt',
    'events',
  ],
  properties: {
    id: { type: 'string', format: 'uuid' },
    projectId: { type: 'string' },
    provider: { type: 'string', enum: ['ollama', 'openai'] },
    mode: { type: 'string', enum: ['fast', 'complete'] },
    model: { type: 'string' },
    prompt: { type: 'string' },
    status: {
      type: 'string',
      enum: ['running', 'succeeded', 'failed', 'cancelled'],
    },
    errorCode: { type: 'string' },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
    finishedAt: { type: 'string' },
    events: { type: 'array', items: executionEventSchema },
  },
} as const;

const implementationResultSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['execution'],
  properties: { execution: executionSchema },
} as const;

const implementationListSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['execution'],
  properties: {
    execution: { anyOf: [executionSchema, { type: 'null' }] },
  },
} as const;

function safeErrorName(error: unknown): string {
  return error instanceof Error ? error.name : 'UnknownError';
}

function translateAiError(
  request: FastifyRequest,
  error: unknown,
  context: Record<string, unknown>,
): never {
  const translated = aiApiError(error);
  if (translated) throw translated;

  request.log.warn(
    { errorName: safeErrorName(error), ...context },
    'AI assistant request failed',
  );
  throw new ApiError({
    statusCode: 502,
    code: 'AI_PROVIDER_REQUEST_FAILED',
    message: 'Não foi possível concluir a operação com o provider de IA.',
  });
}

export const aiAssistantRoutes: FastifyPluginAsync<
  AiAssistantRouteOptions
> = async (app, options) => {
  function projectFor(projectId: string) {
    const project = options.projectStore.findProject(projectId);
    if (!project) {
      throw new ApiError({
        statusCode: 404,
        code: 'PROJECT_NOT_FOUND',
        message: 'Projeto não encontrado.',
      });
    }
    return project;
  }

  async function selectedAssistant(
    request: FastifyRequest,
    projectId: string,
    model?: string,
  ) {
    try {
      return await options.aiProviderResolver.resolveSelected(projectId, model);
    } catch (error) {
      translateAiError(request, error, {
        projectId,
        ...(model ? { model } : {}),
      });
    }
  }

  app.get<{ Params: ProjectParams }>(
    '/projects/:projectId/ai/status',
    {
      schema: {
        params: projectParamsSchema,
        response: {
          200: statusSchema,
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      projectFor(request.params.projectId);
      const status = await options.aiProviderResolver.status(
        request.params.projectId,
      );
      const selected = status.providers.find(
        (provider) => provider.id === status.selectedProvider,
      );
      if (!selected) {
        throw new ApiError({
          statusCode: 500,
          code: 'AI_ASSISTANT_FAILED',
          message: 'O provider de IA selecionado não foi encontrado.',
        });
      }
      const consentGranted =
        !selected.consentRequired || selected.consentGranted;
      return {
        available: selected.available && consentGranted,
        ...(selected.baseUrl ? { baseUrl: selected.baseUrl } : {}),
        message: consentGranted
          ? selected.message
          : 'Autorize o uso da OpenAI para este projeto antes de enviar código à cloud.',
        models: selected.models,
        ...(!consentGranted
          ? { errorCode: 'AI_CLOUD_CONSENT_REQUIRED' as const }
          : selected.errorCode
            ? { errorCode: selected.errorCode }
            : {}),
      };
    },
  );

  app.post<{ Params: ProjectParams; Body: ImplementationBody }>(
    '/projects/:projectId/ai/implementations',
    {
      schema: {
        params: projectParamsSchema,
        body: implementationBodySchema,
        response: {
          201: implementationResultSchema,
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      const project = projectFor(request.params.projectId);
      const execution = options.aiImplementationExecutionService.start(
        project,
        request.body.model,
        request.body.prompt,
      );
      return reply.status(201).send({ execution });
    },
  );

  app.get<{ Params: ProjectParams }>(
    '/projects/:projectId/ai/implementations',
    {
      schema: {
        params: projectParamsSchema,
        response: {
          200: implementationListSchema,
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      projectFor(request.params.projectId);
      return {
        execution: options.aiImplementationExecutionService.latestForProject(
          request.params.projectId,
        ),
      };
    },
  );

  app.get<{ Params: ExecutionParams }>(
    '/projects/:projectId/ai/implementations/:executionId',
    {
      schema: {
        params: executionParamsSchema,
        response: {
          200: implementationResultSchema,
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      projectFor(request.params.projectId);
      const execution = options.aiImplementationExecutionService.find(
        request.params.projectId,
        request.params.executionId,
      );
      if (!execution) {
        throw new ApiError({
          statusCode: 404,
          code: 'AI_IMPLEMENTATION_NOT_FOUND',
          message: 'Execução de implementação não encontrada.',
        });
      }
      return { execution };
    },
  );

  app.post<{ Params: ExecutionParams }>(
    '/projects/:projectId/ai/implementations/:executionId/cancel',
    {
      schema: {
        params: executionParamsSchema,
        response: {
          200: implementationResultSchema,
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      projectFor(request.params.projectId);
      const execution = options.aiImplementationExecutionService.cancel(
        request.params.projectId,
        request.params.executionId,
      );
      if (!execution) {
        throw new ApiError({
          statusCode: 404,
          code: 'AI_IMPLEMENTATION_NOT_FOUND',
          message: 'Execução de implementação não encontrada.',
        });
      }
      return { execution };
    },
  );

  app.post<{ Params: ProjectParams; Body: ChatBody }>(
    '/projects/:projectId/ai/chat',
    { schema: { params: projectParamsSchema, body: chatBodySchema } },
    async (request, reply) => {
      const project = projectFor(request.params.projectId);
      const resolved = await selectedAssistant(
        request,
        project.id,
        request.body.model,
      );

      // Autenticação, origem, provider, consentimento, modelo e limites já
      // foram validados antes de assumirmos a resposta como um stream contínuo.
      reply.hijack();
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      const controller = new AbortController();
      reply.raw.once('close', () => controller.abort());

      const write = (event: AiChatStreamEvent): void => {
        if (reply.raw.writableEnded) return;
        reply.raw.write(
          `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
        );
      };

      try {
        await resolved.assistantService.chat(
          project,
          request.body.model,
          request.body.messages,
          { send: write, signal: controller.signal },
          resolved.mode,
        );
      } catch (error) {
        const code = aiErrorCode(error) ?? 'AI_PROVIDER_REQUEST_FAILED';
        request.log.warn(
          {
            errorName: safeErrorName(error),
            projectId: project.id,
            provider: resolved.provider,
            mode: resolved.mode,
            model: request.body.model,
            code,
          },
          'AI assistant chat failed',
        );
        write({
          type: 'error',
          code,
          message:
            error instanceof Error
              ? error.message
              : 'Falha ao conversar com o assistente de IA.',
        });
      } finally {
        if (!reply.raw.writableEnded) reply.raw.end();
      }
    },
  );

  app.post<{ Params: ProjectParams; Body: CompletionBody }>(
    '/projects/:projectId/ai/complete',
    {
      schema: {
        params: projectParamsSchema,
        body: completionBodySchema,
        response: {
          200: completionResultSchema,
          ...commonErrorResponseSchemas,
          ...aiProviderErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      const project = projectFor(request.params.projectId);
      const resolved = await selectedAssistant(
        request,
        project.id,
        request.body.model,
      );
      const controller = new AbortController();
      request.raw.once('close', () => controller.abort());
      try {
        return await resolved.assistantService.complete(
          request.body.model,
          request.body.prefix,
          request.body.suffix ?? '',
          controller.signal,
        );
      } catch (error) {
        if (controller.signal.aborted) {
          // O cliente cancelou (nova tecla digitada); não há mais ninguém
          // ouvindo a resposta — evita que o Fastify tente serializar uma
          // resposta para uma conexão já fechada.
          reply.hijack();
          return;
        }
        translateAiError(request, error, {
          projectId: project.id,
          provider: resolved.provider,
          mode: resolved.mode,
          model: request.body.model,
        });
      }
    },
  );

  app.post<{ Params: ProjectParams; Body: ModelPullBody }>(
    '/projects/:projectId/ai/models/pull',
    { schema: { params: projectParamsSchema, body: modelPullBodySchema } },
    async (request, reply) => {
      const project = projectFor(request.params.projectId);
      const resolved = await selectedAssistant(request, project.id);
      reply.hijack();
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      const controller = new AbortController();
      reply.raw.once('close', () => controller.abort());
      const write = (event: AiModelPullStreamEvent): void => {
        if (reply.raw.writableEnded) return;
        reply.raw.write(
          `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
        );
      };

      try {
        await resolved.assistantService.pullRecommendedModel(
          request.body.model,
          { send: write, signal: controller.signal },
        );
      } catch (error) {
        const code = aiErrorCode(error) ?? 'AI_PROVIDER_REQUEST_FAILED';
        request.log.warn(
          {
            errorName: safeErrorName(error),
            projectId: project.id,
            provider: resolved.provider,
            mode: resolved.mode,
            model: request.body.model,
            code,
          },
          'AI model installation failed',
        );
        write({
          type: 'error',
          code,
          message:
            error instanceof Error
              ? error.message
              : 'O provider selecionado não permite instalar este modelo.',
        });
      } finally {
        if (!reply.raw.writableEnded) reply.raw.end();
      }
    },
  );
};
