import type { Dirent } from 'node:fs';

import {
  readdir,
  readFile,
  stat,
} from 'node:fs/promises';

import path from 'node:path';

import type {
  FastifyPluginAsync,
  FastifyPluginOptions,
} from 'fastify';

import { ApiError } from '../http/api-error.js';
import { commonErrorResponseSchemas } from '../http/response-schemas.js';
import type { ProjectStore } from '../store/project-store.js';

interface ProjectParams {
  projectId: string;
}

interface ProjectReadmeRouteOptions extends FastifyPluginOptions {
  projectStore: ProjectStore;
}

const maxReadmeSize = 512 * 1024;

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

const projectReadmeSchema = {
  anyOf: [
    {
      type: 'object',
      additionalProperties: false,
      required: ['filename', 'content'],
      properties: {
        filename: { type: 'string' },
        content: { type: 'string' },
      },
    },
    { type: 'null' },
  ],
} as const;

function readmePriority(filename: string): number {
  const normalized = filename.toLowerCase();

  if (normalized === 'readme.md') return 0;
  if (normalized === 'readme') return 1;
  if (normalized === 'readme.mdown') return 2;
  if (normalized === 'readme.markdown') return 3;
  if (normalized === 'readme.rdoc') return 4;
  if (normalized === 'readme.adoc') return 5;

  return 10;
}

async function findReadme(projectPath: string): Promise<{
  filename: string;
  content: string;
} | null> {
  let entries: Dirent[];

  try {
    entries = await readdir(projectPath, { withFileTypes: true });
  } catch (error) {
    throw new ApiError({
      statusCode: 500,
      code: 'PROJECT_README_DIRECTORY_FAILED',
      message:
        error instanceof Error
          ? error.message
          : 'Não foi possível consultar os arquivos do projeto.',
    });
  }

  const candidates = entries
    .filter(
      (entry) =>
        entry.isFile() &&
        /^readme(?:\.[a-z0-9._-]+)?$/i.test(entry.name),
    )
    .map((entry) => entry.name)
    .sort(
      (left, right) =>
        readmePriority(left) - readmePriority(right) ||
        left.localeCompare(right),
    );

  const filename = candidates[0];

  if (!filename) {
    return null;
  }

  const readmePath = path.join(projectPath, filename);
  const readmeStats = await stat(readmePath);

  if (!readmeStats.isFile()) {
    return null;
  }

  if (readmeStats.size > maxReadmeSize) {
    throw new ApiError({
      statusCode: 413,
      code: 'PROJECT_README_TOO_LARGE',
      message: 'O README do projeto ultrapassa o limite de 512 KB.',
    });
  }

  return {
    filename,
    content: await readFile(readmePath, 'utf8'),
  };
}

export const projectReadmeRoutes: FastifyPluginAsync<
  ProjectReadmeRouteOptions
> = async (app, options) => {
  app.get<{ Params: ProjectParams }>(
    '/projects/:projectId/readme',
    {
      schema: {
        params: projectParamsSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['readme'],
            properties: {
              readme: projectReadmeSchema,
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

      return {
        readme: await findReadme(project.path),
      };
    },
  );
};
