import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';

import type {
  ProductionOverview,
  Project,
  Workspace,
} from '@dev-dashboard/contracts';

import { ApiError } from '../http/api-error.js';
import {
  commonErrorResponseSchemas,
  productionOverviewResponseSchema,
} from '../http/response-schemas.js';

interface WorkspaceParams {
  workspaceId: string;
}

export interface ProductionOverviewWorkspaceRepository {
  find(workspaceId: string): Promise<Workspace | null>;
}

export interface ProductionOverviewProjectStore {
  listWorkspaceScans(): Array<{
    workspaceId: string;
    projects: Project[];
  }>;
}

export interface ProductionOverviewReader {
  read(projects: readonly Project[]): Promise<ProductionOverview>;
}

interface Options extends FastifyPluginOptions {
  workspaceRepository: ProductionOverviewWorkspaceRepository;
  projectStore: ProductionOverviewProjectStore;
  productionOverviewService: ProductionOverviewReader;
}

const workspaceParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['workspaceId'],
  properties: {
    workspaceId: { type: 'string', minLength: 1 },
  },
} as const;

export const productionOverviewRoutes: FastifyPluginAsync<Options> = async (
  app,
  options,
) => {
  app.get<{ Params: WorkspaceParams }>(
    '/workspaces/:workspaceId/production/overview',
    {
      schema: {
        params: workspaceParamsSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['overview'],
            properties: {
              overview: productionOverviewResponseSchema,
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const workspace = await options.workspaceRepository.find(
        request.params.workspaceId,
      );
      if (!workspace) {
        throw new ApiError({
          statusCode: 404,
          code: 'WORKSPACE_NOT_FOUND',
          message: 'Workspace não encontrado.',
        });
      }

      const scan = options.projectStore
        .listWorkspaceScans()
        .find((item) => item.workspaceId === workspace.id);

      return {
        overview: await options.productionOverviewService.read(
          scan?.projects ?? [],
        ),
      };
    },
  );
};
