import {
  createReadStream,
  type Dirent,
} from 'node:fs';

import {
  readdir,
  stat,
} from 'node:fs/promises';

import path from 'node:path';

import type {
  FastifyPluginAsync,
  FastifyPluginOptions,
} from 'fastify';

import type { ProjectStore } from '../store/project-store.js';
import { GitDiffError, type GitService } from '../services/git-service.js';

import { ApiError } from '../http/api-error.js';

import {
  commonErrorResponseSchemas,
  gitDiffSnapshotResponseSchema,
  gitFileDiffResponseSchema,
  projectResponseSchema,
  projectGitOverviewResponseSchema,
} from '../http/response-schemas.js';

interface ProjectParams {
  projectId: string;
}

const faviconDirectories = [
  '',
  'public',
  'static',
  'src/assets',
  'app',
  'app/assets/images',
] as const;

const faviconNamePattern =
  /^(?:favicon(?:[-._].*)?|icon|apple-touch-icon)\.(?:ico|png|svg|webp)$/i;

function faviconContentType(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case '.svg':
      return 'image/svg+xml';
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    default:
      return 'image/x-icon';
  }
}

async function findProjectFavicon(
  projectPath: string,
): Promise<string | null> {
  for (const relativeDirectory of faviconDirectories) {
    const directoryPath = path.join(
      projectPath,
      relativeDirectory,
    );

    let entries: Dirent[];

    try {
      entries = await readdir(directoryPath, {
        withFileTypes: true,
      });
    } catch {
      continue;
    }

    const candidateNames = entries
      .filter(
        (entry) =>
          entry.isFile() &&
          faviconNamePattern.test(entry.name),
      )
      .map((entry) => entry.name)
      .sort((left, right) => {
        const preferred = [
          'favicon.ico',
          'favicon.svg',
          'favicon.png',
          'icon.svg',
          'icon.png',
        ];

        const leftRank = preferred.indexOf(
          left.toLowerCase(),
        );
        const rightRank = preferred.indexOf(
          right.toLowerCase(),
        );

        return (
          (leftRank < 0 ? preferred.length : leftRank) -
            (rightRank < 0 ? preferred.length : rightRank) ||
          left.localeCompare(right)
        );
      });

    for (const candidateName of candidateNames) {
      const candidatePath = path.join(
        directoryPath,
        candidateName,
      );

      try {
        const candidateStats = await stat(candidatePath);

        if (
          candidateStats.isFile() &&
          candidateStats.size <= 2 * 1024 * 1024
        ) {
          return candidatePath;
        }
      } catch {
        // O próximo candidato será tentado.
      }
    }
  }

  return null;
}

const projectParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId'],
  properties: {
    projectId: {
      type: 'string',
      minLength: 1,
    },
  },
} as const;

interface ProjectRouteOptions extends FastifyPluginOptions {
  projectStore: ProjectStore;
  gitService: GitService;
}

export const projectRoutes: FastifyPluginAsync<
  ProjectRouteOptions
> = async (app, options) => {
  const { projectStore, gitService } = options;
  app.get(
    '/projects',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['projects'],
            properties: {
              projects: {
                type: 'array',
                items: projectResponseSchema,
              },
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async () => ({
      projects: projectStore.listProjects(),
    }),
  );
  app.get<{
    Params: ProjectParams;
  }>(
    '/projects/:projectId/favicon',
    {
      schema: {
        params: projectParamsSchema,
      },
    },
    async (request, reply) => {
      const project = projectStore.findProject(
        request.params.projectId,
      );

      if (!project) {
        throw new ApiError({
          statusCode: 404,
          code: 'PROJECT_NOT_FOUND',
          message: 'Projeto não encontrado.',
        });
      }

      const faviconPath = await findProjectFavicon(
        project.path,
      );

      if (!faviconPath) {
        throw new ApiError({
          statusCode: 404,
          code: 'PROJECT_FAVICON_NOT_FOUND',
          message: 'Favicon não encontrado.',
        });
      }

      return reply
        .header('Cache-Control', 'private, max-age=300')
        .type(faviconContentType(faviconPath))
        .send(createReadStream(faviconPath));
    },
  );


  app.get<{ Params: ProjectParams }>(
    '/projects/:projectId/git',
    {
      schema: {
        params: projectParamsSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['git'],
            properties: { git: projectGitOverviewResponseSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = projectStore.findProject(request.params.projectId);
      if (!project) {
        throw new ApiError({ statusCode: 404, code: 'PROJECT_NOT_FOUND', message: 'Projeto não encontrado.' });
      }
      try {
        return { git: await gitService.getOverview(project.path) };
      } catch (error) {
        throw new ApiError({
          statusCode: 500,
          code: 'GIT_COMMAND_FAILED',
          message: error instanceof Error ? error.message : 'Não foi possível consultar o repositório Git.',
        });
      }
    },
  );

  app.get<{ Params: ProjectParams; Querystring: { scope?: 'worktree' | 'index' | 'combined' } }>(
    '/projects/:projectId/git/diff',
    {
      schema: {
        params: projectParamsSchema,
        querystring: {
          type: 'object', additionalProperties: false,
          properties: { scope: { type: 'string', enum: ['worktree', 'index', 'combined'] } },
        },
        response: {
          200: {
            type: 'object', additionalProperties: false,
            required: ['diff'],
            properties: { diff: gitDiffSnapshotResponseSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = projectStore.findProject(request.params.projectId);
      if (!project) throw new ApiError({ statusCode: 404, code: 'PROJECT_NOT_FOUND', message: 'Projeto não encontrado.' });
      try {
        return { diff: await gitService.getDiffSnapshot(project.path, request.query.scope ?? 'combined') };
      } catch (error) {
        throw new ApiError({
          statusCode: 500, code: 'GIT_COMMAND_FAILED',
          message: error instanceof Error ? error.message : 'Não foi possível consultar o diff do repositório.',
        });
      }
    },
  );

  app.get<{ Params: ProjectParams; Querystring: { path: string; scope?: 'worktree' | 'index' | 'combined' } }>(
    '/projects/:projectId/git/diff/file',
    {
      schema: {
        params: projectParamsSchema,
        querystring: {
          type: 'object', additionalProperties: false,
          required: ['path'],
          properties: {
            path: { type: 'string', minLength: 1, maxLength: 2048 },
            scope: { type: 'string', enum: ['worktree', 'index', 'combined'] },
          },
        },
        response: {
          200: {
            type: 'object', additionalProperties: false,
            required: ['file'],
            properties: { file: gitFileDiffResponseSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = projectStore.findProject(request.params.projectId);
      if (!project) throw new ApiError({ statusCode: 404, code: 'PROJECT_NOT_FOUND', message: 'Projeto não encontrado.' });
      try {
        return { file: await gitService.getFileDiff(project.path, request.query.path, request.query.scope ?? 'combined') };
      } catch (error) {
        if (error instanceof GitDiffError) {
          const statuses: Record<string, number> = {
            GIT_NOT_REPOSITORY: 400,
            GIT_DIFF_PATH_OUTSIDE_PROJECT: 400,
            GIT_DIFF_PATH_INVALID: 400,
          };
          throw new ApiError({ statusCode: statuses[error.code] ?? 400, code: error.code, message: error.message });
        }
        throw new ApiError({
          statusCode: 500, code: 'GIT_COMMAND_FAILED',
          message: error instanceof Error ? error.message : 'Não foi possível carregar o diff do arquivo.',
        });
      }
    },
  );

  app.get<{
    Params: ProjectParams;
  }>(
    '/projects/:projectId',
    {
      schema: {
        params: projectParamsSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['project'],
            properties: {
              project: projectResponseSchema,
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = projectStore.findProject(
        request.params.projectId,
      );

      if (!project) {
        throw new ApiError({
          statusCode: 404,
          code: 'PROJECT_NOT_FOUND',
          message: 'Projeto não encontrado.',
        });
      }

      return {
        project,
      };
    },
  );

};
