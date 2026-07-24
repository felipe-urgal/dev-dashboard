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
} from 'fastify';

import {
  findProject,
  listProjects,
} from '../store/project-store.js';

import { ApiError } from '../http/api-error.js';

import {
  commonErrorResponseSchemas,
  projectResponseSchema,
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

export const projectRoutes: FastifyPluginAsync = async (app) => {
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
      projects: listProjects(),
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
      const project = findProject(request.params.projectId);

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
      const project = findProject(request.params.projectId);

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
