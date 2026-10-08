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

export const README_DISCOVERY_LIMITS = {
  directories: 200,
  files: 500,
  depth: 8,
  entries: 5_000,
} as const;

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
  if (normalized === 'readme.mdown') return 1;
  if (normalized === 'readme.markdown') return 2;

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
 * Discovery bounded em ordem estável. A ordenação de cada diretório precede
 * qualquer limite; o catálogo final mantém a prioridade dos READMEs.
 * Não lê conteúdo: apenas realpath/stat e entradas de diretório.
 */
export async function listMarkdownFiles(
  projectPath: string,
): Promise<{ files: ProjectFileEntry[]; truncated: boolean }> {
  const root = await realpath(projectPath);
  const queue: Array<{
    relativePath: string;
    absolutePath: string;
    depth: number;
  }> = [{ relativePath: '', absolutePath: root, depth: 0 }];
  const visitedDirectories = new Set<string>();
  const files: ProjectFileEntry[] = [];
  let entriesExamined = 0;
  let truncated = false;

  while (queue.length > 0) {
    if (visitedDirectories.size >= README_DISCOVERY_LIMITS.directories) {
      truncated = true;
      break;
    }
    const current = queue.shift()!;
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
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

    for (const entry of entries) {
      const relativePath = publicPath(current.relativePath, entry.name);
      if (shouldHide(relativePath)) continue;
      if (entriesExamined >= README_DISCOVERY_LIMITS.entries) {
        truncated = true;
        break;
      }
      entriesExamined += 1;

      // Um arquivo Markdown extra confirma truncamento sem perder o limite.
      if (files.length >= README_DISCOVERY_LIMITS.files) {
        truncated = true;
        break;
      }
      let canonicalEntry: string;
      try {
        canonicalEntry = await realpath(
          path.join(canonicalDirectory, entry.name),
        );
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
        if (current.depth >= README_DISCOVERY_LIMITS.depth) {
          truncated = true;
        } else if (!visitedDirectories.has(canonicalEntry)) {
          queue.push({
            relativePath,
            absolutePath: canonicalEntry,
            depth: current.depth + 1,
          });
        }
        continue;
      }
      if (!stats.isFile() || !MARKDOWN_EXTENSION_PATTERN.test(entry.name))
        continue;
      files.push({
        path: relativePath,
        name: entry.name,
        kind: 'file',
        language: 'markdown',
        size: stats.size,
      });
    }
    if (
      truncated &&
      (entriesExamined >= README_DISCOVERY_LIMITS.entries ||
        files.length >= README_DISCOVERY_LIMITS.files)
    )
      break;
  }

  files.sort((left, right) => {
    const priorityDiff = readmePriority(left.name) - readmePriority(right.name);
    if (priorityDiff !== 0) return priorityDiff;
    return left.path < right.path ? -1 : left.path > right.path ? 1 : 0;
  });
  return { files, truncated };
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
