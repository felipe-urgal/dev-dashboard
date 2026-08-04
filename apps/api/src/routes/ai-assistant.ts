import type { FastifyPluginAsync } from 'fastify';

import type { AiChatStreamEvent } from '@dev-dashboard/contracts';

import { ApiError } from '../http/api-error.js';
import { commonErrorResponseSchemas } from '../http/response-schemas.js';
import type { AiAssistantService } from '../services/ai-assistant-service.js';
import type { ProjectStore } from '../store/project-store.js';
import {
  projectParamsSchema,
  type ProjectParams,
} from './projects/helpers.js';

interface AiAssistantRouteOptions {
  projectStore: ProjectStore;
  aiAssistantService: AiAssistantService;
}

interface ChatBody {
  model: string;
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
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
    messages: { type: 'array', minItems: 1, maxItems: 40, items: chatMessageSchema },
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
          capabilities: { type: 'array', items: { type: 'string', enum: ['chat', 'tools'] } },
        },
      },
    },
  },
} as const;

export const aiAssistantRoutes: FastifyPluginAsync<AiAssistantRouteOptions> = async (
  app,
  options,
) => {
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
        reply.raw.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      };

      try {
        await options.aiAssistantService.chat(
          project,
          request.body.model,
          request.body.messages,
          { send: write, signal: controller.signal },
        );
      } catch (error) {
        write({
          type: 'error',
          message: error instanceof Error ? error.message : 'Falha ao conversar com o assistente de IA.',
        });
      } finally {
        if (!reply.raw.writableEnded) reply.raw.end();
      }
    },
  );
};
