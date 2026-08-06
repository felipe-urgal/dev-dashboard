import type { FastifyPluginAsync } from 'fastify';

import type { ProcessManager } from '@dev-dashboard/process-manager';
import type { ProjectBrowserTarget } from '@dev-dashboard/contracts';

import { ApiError } from '../http/api-error.js';
import { commonErrorResponseSchemas } from '../http/response-schemas.js';
import {
  ProjectBrowserError,
  type ProjectBrowserService,
} from '../services/project-browser-service.js';
import type { ProjectStore } from '../store/project-store.js';
import { projectParamsSchema, type ProjectParams } from './projects/helpers.js';

interface ProjectBrowserRouteOptions {
  projectStore: ProjectStore;
  processManager: ProcessManager;
  projectBrowserService: ProjectBrowserService;
}

// Catálogo fechado: o navegador só pode pedir para abrir um destino
// conhecido, nunca uma URL digitada. Por ora só existe o servidor gerenciado
// do próprio projeto; a API resolve a URL real a partir do processo em
// execução, nunca a partir do corpo da requisição.
const browserTargetSchema = {
  type: 'string',
  enum: ['server'],
} as const;

interface OpenBrowserBody {
  target: ProjectBrowserTarget;
}

function translateBrowserError(error: unknown): never {
  if (error instanceof ProjectBrowserError) {
    throw new ApiError({
      statusCode: error.code === 'BROWSER_NOT_AVAILABLE' ? 409 : 500,
      code: error.code,
      message: error.message,
    });
  }
  throw error;
}

export const projectBrowserRoutes: FastifyPluginAsync<
  ProjectBrowserRouteOptions
> = async (app, options) => {
  app.post<{ Params: ProjectParams; Body: OpenBrowserBody }>(
    '/projects/:projectId/browser/open',
    {
      schema: {
        params: projectParamsSchema,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['target'],
          properties: { target: browserTargetSchema },
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['target', 'url', 'opened'],
            properties: {
              target: browserTargetSchema,
              url: { type: 'string' },
              opened: { type: 'boolean', const: true },
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = options.projectStore.findProject(
        request.params.projectId,
      );
      if (!project) {
        throw new ApiError({
          statusCode: 404,
          code: 'PROJECT_NOT_FOUND',
          message: 'Projeto não encontrado.',
        });
      }

      // O único destino do catálogo hoje é o servidor gerenciado do próprio
      // projeto: a URL vem do processo já rastreado pelo ProcessManager, não
      // de nada enviado pelo navegador, e só é aberta se o processo estiver
      // de fato em execução.
      const managedProcess = await options.processManager.getServerProcess(
        project.id,
      );
      if (
        !managedProcess ||
        managedProcess.status !== 'running' ||
        !managedProcess.url
      ) {
        throw new ApiError({
          statusCode: 409,
          code: 'BROWSER_TARGET_NOT_RUNNING',
          message: 'O servidor deste projeto não está em execução.',
        });
      }

      try {
        return await options.projectBrowserService.open(
          request.body.target,
          managedProcess.url,
        );
      } catch (error) {
        translateBrowserError(error);
      }
    },
  );
};
