import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';

import type { ProductionContractDraft } from '@dev-dashboard/contracts';

import { ApiError } from '../http/api-error.js';
import { commonErrorResponseSchemas } from '../http/response-schemas.js';
import {
  ContractSetupError,
  ProductionContractSetupService,
} from '../deployment/contract-setup.js';
import type { ProjectStore } from '../store/project-store.js';

interface Options extends FastifyPluginOptions {
  projectStore: ProjectStore;
  setupService?: ProductionContractSetupService;
}

interface ProjectParams {
  projectId: string;
}

const projectParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId'],
  properties: { projectId: { type: 'string', minLength: 1 } },
} as const;

const OPERATIONS = [
  'prepare',
  'status',
  'check',
  'backup',
  'migrate',
  'deploy',
  'verify',
  'restoreCheck',
  'rollback',
  'logs',
] as const;

const draftSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['strategy', 'provider', 'branch', 'commands', 'policies'],
  properties: {
    strategy: {
      type: 'string',
      enum: ['command', 'git-managed', 'self-update'],
    },
    provider: {
      type: 'string',
      enum: ['systemd', 'docker-compose', 'vercel', 'none'],
    },
    branch: { type: 'string', minLength: 1, maxLength: 128 },
    commands: {
      type: 'array',
      maxItems: OPERATIONS.length,
      items: { type: 'string', enum: OPERATIONS },
    },
    healthUrl: { type: 'string', maxLength: 2048 },
    externalProject: { type: 'string', maxLength: 128 },
    policies: {
      type: 'object',
      additionalProperties: false,
      required: ['backup', 'migrations', 'rollback'],
      properties: {
        backup: {
          type: 'string',
          enum: [
            'required-before-migration',
            'required-before-deploy',
            'external',
            'not-configured',
          ],
        },
        migrations: {
          type: 'string',
          enum: ['startup', 'before-deploy', 'not-configured'],
        },
        rollback: {
          type: 'string',
          enum: [
            'restore-backup-when-schema-changed',
            'manual-restore',
            'provider-only-when-schema-compatible',
            'not-configured',
          ],
        },
      },
    },
  },
} as const;

const anyObject = { type: 'object', additionalProperties: true } as const;

export const productionContractRoutes: FastifyPluginAsync<Options> = async (
  app,
  options,
) => {
  const service = options.setupService ?? new ProductionContractSetupService();

  function projectPath(projectId: string): string {
    const project = options.projectStore.findProject(projectId);
    if (!project) {
      throw new ApiError({
        statusCode: 404,
        code: 'PROJECT_NOT_FOUND',
        message: 'Projeto não encontrado.',
      });
    }
    return project.path;
  }

  app.get<{ Params: ProjectParams }>(
    '/projects/:projectId/production/contract/setup',
    {
      schema: {
        params: projectParamsSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['setup'],
            properties: { setup: anyObject },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => ({
      setup: await service.info(projectPath(request.params.projectId)),
    }),
  );

  app.post<{ Params: ProjectParams; Body: ProductionContractDraft }>(
    '/projects/:projectId/production/contract/preview',
    {
      schema: {
        params: projectParamsSchema,
        body: draftSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['preview'],
            properties: { preview: anyObject },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => ({
      preview: await service.preview(
        projectPath(request.params.projectId),
        request.body,
      ),
    }),
  );

  app.put<{
    Params: ProjectParams;
    Body: { draft: ProductionContractDraft; overwrite?: boolean };
  }>(
    '/projects/:projectId/production/contract',
    {
      schema: {
        params: projectParamsSchema,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['draft'],
          properties: {
            draft: draftSchema,
            overwrite: { type: 'boolean' },
          },
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['preview'],
            properties: { preview: anyObject },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      try {
        return {
          preview: await service.write(
            projectPath(request.params.projectId),
            request.body.draft,
            { overwrite: request.body.overwrite === true },
          ),
        };
      } catch (error) {
        if (error instanceof ContractSetupError) {
          throw new ApiError({
            statusCode:
              error.code === 'ALREADY_EXISTS'
                ? 409
                : error.code === 'INVALID_DRAFT'
                  ? 400
                  : 500,
            code:
              error.code === 'ALREADY_EXISTS'
                ? 'CONFLICT'
                : error.code === 'INVALID_DRAFT'
                  ? 'BAD_REQUEST'
                  : 'INTERNAL_ERROR',
            message: error.message,
          });
        }
        throw error;
      }
    },
  );
};
