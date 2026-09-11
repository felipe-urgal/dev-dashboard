import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';

import { ApiError } from '../http/api-error.js';
import { commonErrorResponseSchemas } from '../http/response-schemas.js';
import type { GitWorktreeLifecycleService } from '../services/git-worktree-lifecycle-service.js';
import type {
  GitWorktreeObserver,
  GitWorktreeSnapshot,
} from '../services/git-worktree-observer.js';
import {
  primaryEnvironmentInstanceId,
  type DevelopmentEnvironmentInstanceStore,
  worktreeEnvironmentInstanceId,
} from '../store/development-environment-instance-store.js';
import type { ProjectStore } from '../store/project-store.js';

interface Options extends FastifyPluginOptions {
  projectStore: ProjectStore;
  gitWorktreeObserver: Pick<GitWorktreeObserver, 'inspect'>;
  gitWorktreeLifecycleService: Pick<
    GitWorktreeLifecycleService,
    'create' | 'prepareRemoval' | 'remove'
  >;
  developmentEnvironmentInstanceStore: Pick<
    DevelopmentEnvironmentInstanceStore,
    'reconcileWorktrees'
  >;
}

interface Params {
  projectId: string;
}

interface WorktreeParams extends Params {
  worktreeId: string;
}

interface CreateBody {
  branch: string;
  directoryName: string;
  createBranch?: boolean;
}

interface RemoveBody {
  confirmationToken: string;
}

interface PublicGitWorktree extends GitWorktreeSnapshot {
  environmentInstanceId?: string;
}

const paramsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId'],
  properties: {
    projectId: { type: 'string', minLength: 1 },
  },
} as const;

const worktreeParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId', 'worktreeId'],
  properties: {
    projectId: { type: 'string', minLength: 1 },
    worktreeId: { type: 'string', minLength: 1, maxLength: 64 },
  },
} as const;

const createBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['branch', 'directoryName'],
  properties: {
    branch: { type: 'string', minLength: 1, maxLength: 256 },
    directoryName: { type: 'string', minLength: 1, maxLength: 160 },
    createBranch: { type: 'boolean' },
  },
} as const;

const removeBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['confirmationToken'],
  properties: {
    confirmationToken: { type: 'string', minLength: 64, maxLength: 64 },
  },
} as const;

const worktreeSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'path',
    'head',
    'detached',
    'bare',
    'kind',
    'locked',
    'prunable',
  ],
  properties: {
    id: { type: 'string' },
    path: { type: 'string' },
    head: { type: 'string' },
    branch: { type: 'string' },
    detached: { type: 'boolean' },
    bare: { type: 'boolean' },
    kind: { type: 'string', enum: ['main', 'linked', 'unknown'] },
    locked: { type: 'boolean' },
    lockReason: { type: 'string' },
    prunable: { type: 'boolean' },
    pruneReason: { type: 'string' },
    environmentInstanceId: { type: 'string' },
  },
} as const;

const inspectionSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['state', 'observedAt', 'worktrees'],
  properties: {
    state: {
      type: 'string',
      enum: ['ready', 'unavailable', 'invalid-output'],
    },
    observedAt: { type: 'string' },
    worktrees: { type: 'array', items: worktreeSchema },
    diagnostic: { type: 'string' },
  },
} as const;

const createResultSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['state', 'path', 'branch'],
  properties: {
    state: {
      type: 'string',
      enum: ['created', 'already-present', 'blocked', 'failed', 'unverified'],
    },
    path: { type: 'string' },
    branch: { type: 'string' },
    worktree: worktreeSchema,
    environmentInstanceId: { type: 'string' },
    diagnostic: { type: 'string' },
  },
} as const;

const prepareRemovalResultSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['state', 'worktreeId'],
  properties: {
    state: { type: 'string', enum: ['ready', 'blocked', 'not-found'] },
    worktreeId: { type: 'string' },
    environmentInstanceId: { type: 'string' },
    path: { type: 'string' },
    branch: { type: 'string' },
    confirmationToken: { type: 'string' },
    expiresAt: { type: 'string' },
    diagnostic: { type: 'string' },
  },
} as const;

const removeResultSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['state', 'worktreeId'],
  properties: {
    state: {
      type: 'string',
      enum: [
        'removed',
        'already-absent',
        'blocked',
        'failed',
        'unverified',
        'cleanup-required',
      ],
    },
    worktreeId: { type: 'string' },
    environmentInstanceId: { type: 'string' },
    path: { type: 'string' },
    branch: { type: 'string' },
    diagnostic: { type: 'string' },
  },
} as const;

function requireProject(store: ProjectStore, projectId: string) {
  const project = store.findProject(projectId);
  if (!project) {
    throw new ApiError({
      statusCode: 404,
      code: 'PROJECT_NOT_FOUND',
      message: 'Projeto não encontrado.',
    });
  }
  return project;
}

function environmentInstanceIdFor(
  projectId: string,
  worktree: GitWorktreeSnapshot,
): string | undefined {
  if (worktree.kind === 'main') return primaryEnvironmentInstanceId(projectId);
  if (worktree.kind === 'linked') {
    return worktreeEnvironmentInstanceId(projectId, worktree.id);
  }
  return undefined;
}

function publicWorktree(
  projectId: string,
  worktree: GitWorktreeSnapshot,
): PublicGitWorktree {
  const environmentInstanceId = environmentInstanceIdFor(projectId, worktree);
  return {
    ...worktree,
    ...(environmentInstanceId ? { environmentInstanceId } : {}),
  };
}

export const gitWorktreeRoutes: FastifyPluginAsync<Options> = async (
  app,
  options,
) => {
  app.get<{ Params: Params }>(
    '/projects/:projectId/worktrees',
    {
      schema: {
        params: paramsSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['inspection'],
            properties: { inspection: inspectionSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = requireProject(
        options.projectStore,
        request.params.projectId,
      );
      const inspection = await options.gitWorktreeObserver.inspect(project);
      if (inspection.state === 'ready') {
        options.developmentEnvironmentInstanceStore.reconcileWorktrees(
          project.id,
          inspection.worktrees,
        );
      }

      return {
        inspection: {
          state: inspection.state,
          observedAt: inspection.observedAt,
          worktrees: inspection.worktrees.map((worktree) =>
            publicWorktree(project.id, worktree),
          ),
          ...(inspection.diagnostic
            ? { diagnostic: inspection.diagnostic }
            : {}),
        },
      };
    },
  );

  app.post<{ Params: Params; Body: CreateBody }>(
    '/projects/:projectId/worktrees',
    {
      schema: {
        params: paramsSchema,
        body: createBodySchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['result'],
            properties: { result: createResultSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = requireProject(
        options.projectStore,
        request.params.projectId,
      );
      const result = await options.gitWorktreeLifecycleService.create(
        project,
        request.body,
      );

      let reconciledWorktree: PublicGitWorktree | undefined;
      let environmentInstanceId: string | undefined;
      if (result.state === 'created' || result.state === 'already-present') {
        const inspection = await options.gitWorktreeObserver.inspect(project);
        if (inspection.state === 'ready') {
          options.developmentEnvironmentInstanceStore.reconcileWorktrees(
            project.id,
            inspection.worktrees,
          );
          const confirmed = result.worktree
            ? inspection.worktrees.find(
                (worktree) => worktree.id === result.worktree?.id,
              )
            : undefined;
          if (confirmed) {
            reconciledWorktree = publicWorktree(project.id, confirmed);
            environmentInstanceId = reconciledWorktree.environmentInstanceId;
          }
        }
      }

      return {
        result: {
          state: result.state,
          path: result.path,
          branch: result.branch,
          ...(reconciledWorktree
            ? { worktree: reconciledWorktree }
            : result.worktree
              ? { worktree: result.worktree }
              : {}),
          ...(environmentInstanceId ? { environmentInstanceId } : {}),
          ...(result.diagnostic ? { diagnostic: result.diagnostic } : {}),
        },
      };
    },
  );

  app.post<{ Params: WorktreeParams }>(
    '/projects/:projectId/worktrees/:worktreeId/removal/confirmations',
    {
      schema: {
        params: worktreeParamsSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['result'],
            properties: { result: prepareRemovalResultSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = requireProject(
        options.projectStore,
        request.params.projectId,
      );

      const inspection = await options.gitWorktreeObserver.inspect(project);
      if (inspection.state === 'ready') {
        options.developmentEnvironmentInstanceStore.reconcileWorktrees(
          project.id,
          inspection.worktrees,
        );
      }

      return {
        result: await options.gitWorktreeLifecycleService.prepareRemoval(
          project,
          request.params.worktreeId,
        ),
      };
    },
  );

  app.post<{ Params: WorktreeParams; Body: RemoveBody }>(
    '/projects/:projectId/worktrees/:worktreeId/removal',
    {
      schema: {
        params: worktreeParamsSchema,
        body: removeBodySchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['result'],
            properties: { result: removeResultSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = requireProject(
        options.projectStore,
        request.params.projectId,
      );
      const result = await options.gitWorktreeLifecycleService.remove(project, {
        worktreeId: request.params.worktreeId,
        confirmationToken: request.body.confirmationToken,
      });

      if (
        result.state === 'removed' ||
        result.state === 'already-absent' ||
        result.state === 'cleanup-required'
      ) {
        const inspection = await options.gitWorktreeObserver.inspect(project);
        if (inspection.state === 'ready') {
          options.developmentEnvironmentInstanceStore.reconcileWorktrees(
            project.id,
            inspection.worktrees,
          );
        }
      }

      return { result };
    },
  );
};
