import type { FastifyPluginAsync, FastifyRequest } from 'fastify';

import type { AiChatStreamEvent } from '@dev-dashboard/contracts';

import { ApiError } from '../http/api-error.js';
import { commonErrorResponseSchemas } from '../http/response-schemas.js';
import {
  AiAssistantError,
  type AiAssistantService,
} from '../services/ai-assistant-service.js';
import type { ProjectStore } from '../store/project-store.js';
import { projectParamsSchema, type ProjectParams } from './projects/helpers.js';

interface AiAssistantRouteOptions {
  projectStore: ProjectStore;
  aiAssistantService: AiAssistantService;
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

function translateAiError(
  request: FastifyRequest,
  error: unknown,
  context: Record<string, unknown>,
): never {
  if (error instanceof AiAssistantError) {
    throw new ApiError({
      statusCode: 400,
      code: 'AI_ASSISTANT_INVALID_REQUEST',
      message: error.message,
    });
  }
  request.log.warn({ err: error, ...context }, 'AI assistant request failed');
  throw new ApiError({
    statusCode: 502,
    code: 'AI_ASSISTANT_FAILED',
    message:
      error instanceof Error
        ? error.message
        : 'Falha ao conversar com o assistente de IA.',
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
      return options.aiAssistantService.status();
    },
  );

  app.post<{ Params: ProjectParams; Body: ChatBody }>(
    '/projects/:projectId/ai/chat',
    { schema: { params: projectParamsSchema, body: chatBodySchema } },
    async (request, reply) => {
      const project = projectFor(request.params.projectId);

      // Autenticação, origem e limites já foram validados pelos hooks
      // globais antes de assumirmos a resposta como um stream contínuo.
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
        await options.aiAssistantService.chat(
          project,
          request.body.model,
          request.body.messages,
          { send: write, signal: controller.signal },
        );
      } catch (error) {
        if (!(error instanceof AiAssistantError)) {
          request.log.warn(
            { err: error, projectId: project.id, model: request.body.model },
            'AI assistant chat failed',
          );
        }
        write({
          type: 'error',
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
        },
      },
    },
    async (request, reply) => {
      const project = projectFor(request.params.projectId);
      const controller = new AbortController();
      request.raw.once('close', () => controller.abort());
      try {
        return await options.aiAssistantService.complete(
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
          model: request.body.model,
        });
      }
    },
  );
};
