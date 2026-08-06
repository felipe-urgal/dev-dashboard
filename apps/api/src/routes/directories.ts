import { homedir } from 'node:os';

import { readdir, realpath, stat } from 'node:fs/promises';

import path from 'node:path';

import type { FastifyPluginAsync } from 'fastify';

import { ApiError } from '../http/api-error.js';
import { commonErrorResponseSchemas } from '../http/response-schemas.js';

interface DirectoryQuery {
  path?: string;
}

function configuredRoot(): string {
  return path.resolve(
    process.env.DEV_DASHBOARD_DIRECTORY_ROOT?.trim() || homedir(),
  );
}

function invalidDirectory(message: string): ApiError {
  return new ApiError({
    statusCode: 400,
    code: 'INVALID_DIRECTORY',
    message,
  });
}

async function resolveConfiguredRoot(): Promise<string> {
  try {
    const rootPath = await realpath(configuredRoot());
    const rootStats = await stat(rootPath);

    if (!rootStats.isDirectory()) {
      throw new Error('not-directory');
    }

    return rootPath;
  } catch {
    throw invalidDirectory(
      'A pasta raiz configurada não existe ou não é acessível.',
    );
  }
}

function isInside(rootPath: string, candidatePath: string): boolean {
  const relative = path.relative(rootPath, candidatePath);

  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== '..' &&
      !path.isAbsolute(relative))
  );
}

export const directoryRoutes: FastifyPluginAsync = async (app) => {
  app.get<{
    Querystring: DirectoryQuery;
  }>(
    '/directories',
    {
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            path: {
              type: 'string',
              minLength: 1,
            },
          },
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['rootPath', 'currentPath', 'parentPath', 'directories'],
            properties: {
              rootPath: { type: 'string' },
              currentPath: { type: 'string' },
              parentPath: {
                anyOf: [{ type: 'string' }, { type: 'null' }],
              },
              directories: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['name', 'path'],
                  properties: {
                    name: { type: 'string' },
                    path: { type: 'string' },
                  },
                },
              },
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const rootPath = await resolveConfiguredRoot();
      const requestedPath = request.query.path
        ? path.resolve(request.query.path)
        : rootPath;

      let currentPath: string;

      try {
        currentPath = await realpath(requestedPath);
        const currentStats = await stat(currentPath);

        if (!currentStats.isDirectory()) {
          throw new Error('not-directory');
        }
      } catch {
        throw invalidDirectory(
          'O diretório selecionado não existe ou não é acessível.',
        );
      }

      if (!isInside(rootPath, currentPath)) {
        throw new ApiError({
          statusCode: 403,
          code: 'DIRECTORY_OUTSIDE_ROOT',
          message: 'O diretório está fora da pasta permitida.',
        });
      }

      const entries = await readdir(currentPath, {
        withFileTypes: true,
      }).catch(() => {
        throw invalidDirectory('O diretório selecionado não pode ser listado.');
      });

      const directories: Array<{
        name: string;
        path: string;
      }> = [];

      for (const entry of entries) {
        if (!entry.isDirectory() && !entry.isSymbolicLink()) {
          continue;
        }

        const entryPath = path.join(currentPath, entry.name);

        try {
          const resolvedEntryPath = await realpath(entryPath);
          const entryStats = await stat(resolvedEntryPath);

          if (
            entryStats.isDirectory() &&
            isInside(rootPath, resolvedEntryPath)
          ) {
            directories.push({
              name: entry.name,
              path: resolvedEntryPath,
            });
          }
        } catch {
          // Diretórios inacessíveis ou symlinks quebrados são ignorados.
        }
      }

      directories.sort((left, right) => left.name.localeCompare(right.name));

      const parentCandidate = path.dirname(currentPath);
      const parentPath =
        currentPath !== rootPath && isInside(rootPath, parentCandidate)
          ? parentCandidate
          : null;

      return {
        rootPath,
        currentPath,
        parentPath,
        directories,
      };
    },
  );
};
