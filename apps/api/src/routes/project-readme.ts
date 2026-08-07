import { readdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';

import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';

import type { ProjectFileEntry } from '@dev-dashboard/contracts';

import { ApiError } from '../http/api-error.js';
import { commonErrorResponseSchemas } from '../http/response-schemas.js';
import type { ProjectFileService } from '../services/project-file-service.js';
import {
  isIgnoredProjectPath,
  isPathWithinRoot,
  isSensitiveProjectPath,
} from '../services/shared/path-guards.js';
import type { ProjectStore } from '../store/project-store.js';
import { fileEntrySchema } from './project-files.js';

interface ProjectParams {
  projectId: string;
}

interface ProjectReadmeRouteOptions extends FastifyPluginOptions {
  projectStore: ProjectStore;
  projectFileService: ProjectFileService;
}

const MARKDOWN_EXTENSION_PATTERN = /\.(?:md|markdown|mdown)$/i;

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

function publicPath(parent: string, name: string): string {
  return parent ? `${parent}/${name}` : name;
}

function shouldHide(relativePath: string): boolean {
  return (
    isIgnoredProjectPath(relativePath) || isSensitiveProjectPath(relativePath)
  );
}

/**
 * Catálogo de todos os arquivos Markdown visíveis do projeto, sem limite de
 * quantidade, profundidade ou tamanho de diretório. A varredura continua
 * respeitando os mesmos caminhos ignorados/sensíveis do editor, impede saída
 * da raiz do projeto e evita ciclos de links simbólicos pelo caminho canônico.
 */
async function listMarkdownFiles(
  projectPath: string,
): Promise<{ files: ProjectFileEntry[]; truncated: false }> {
  const root = await realpath(projectPath);
  const queue: Array<{ relativePath: string; absolutePath: string }> = [
    { relativePath: '', absolutePath: root },
  ];
  const visitedDirectories = new Set<string>();
  const files: ProjectFileEntry[] = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;

    let canonicalDirectory: string;
    try {
      canonicalDirectory = await realpath(current.absolutePath);
    } catch {
      continue;
    }

    if (
      !isPathWithinRoot(root, canonicalDirectory) ||
      visitedDirectories.has(canonicalDirectory)
    ) {
      continue;
    }
    visitedDirectories.add(canonicalDirectory);

    let entries;
    try {
      entries = await readdir(canonicalDirectory, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const relativePath = publicPath(current.relativePath, entry.name);
      if (shouldHide(relativePath)) continue;

      let canonicalEntry: string;
      try {
        canonicalEntry = await realpath(path.join(canonicalDirectory, entry.name));
      } catch {
        continue;
      }
      if (!isPathWithinRoot(root, canonicalEntry)) continue;

      let stats;
      try {
        stats = await stat(canonicalEntry);
      } catch {
        continue;
      }

      if (stats.isDirectory()) {
        queue.push({
          relativePath,
          absolutePath: canonicalEntry,
        });
        continue;
      }
      if (!stats.isFile() || !MARKDOWN_EXTENSION_PATTERN.test(entry.name)) {
        continue;
      }

      files.push({
        path: relativePath,
        name: entry.name,
        kind: 'file',
        language: 'markdown',
        size: stats.size,
      });
    }
  }

  files.sort((left, right) => {
    const priorityDiff = readmePriority(left.name) - readmePriority(right.name);
    if (priorityDiff !== 0) return priorityDiff;
    return left.path.localeCompare(right.path, 'pt-BR');
  });

  return { files, truncated: false };
}

export const projectReadmeRoutes: FastifyPluginAsync<
  ProjectReadmeRouteOptions
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
    '/projects/:projectId/readme/files',
    {
      schema: {
        params: projectParamsSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['files', 'truncated'],
            properties: {
              files: { type: 'array', items: fileEntrySchema },
              truncated: { type: 'boolean' },
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = projectFor(request.params.projectId);
      return listMarkdownFiles(project.path);
    },
  );
};
