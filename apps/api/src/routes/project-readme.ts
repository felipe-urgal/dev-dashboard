import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';

import type { ProjectFileEntry } from '@dev-dashboard/contracts';

import { ApiError } from '../http/api-error.js';
import { commonErrorResponseSchemas } from '../http/response-schemas.js';
import type { ProjectFileService } from '../services/project-file-service.js';
import type { ProjectStore } from '../store/project-store.js';
import { fileEntrySchema } from './project-files.js';

interface ProjectParams {
  projectId: string;
}

interface ProjectReadmeRouteOptions extends FastifyPluginOptions {
  projectStore: ProjectStore;
  projectFileService: ProjectFileService;
}

/**
 * Limites do catálogo de Markdown: mesma régua de `ProjectFileService.search`
 * (varredura em largura, ignorando `node_modules`/`.git`/etc. via
 * `listDirectory`), só que catalogando nome em vez de conteúdo.
 */
const MAX_MARKDOWN_FILES = 200;
const MAX_MARKDOWN_SCAN_DEPTH = 8;
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

/**
 * Catálogo de todo arquivo Markdown do projeto (não só o README da raiz),
 * ordenado com os candidatos a README raiz primeiro (mesma prioridade que o
 * dashboard já usava para escolher o README único) e o restante em ordem
 * alfabética por caminho. Reaproveita `ProjectFileService.listDirectory` —
 * já bounded, já ignora `node_modules`/`.git`/etc. e já valida contenção no
 * projeto — em vez de reimplementar a varredura segura de diretórios.
 */
async function listMarkdownFiles(
  projectFileService: ProjectFileService,
  projectPath: string,
): Promise<{ files: ProjectFileEntry[]; truncated: boolean }> {
  const queue: Array<{ relativePath: string; depth: number }> = [
    { relativePath: '', depth: 0 },
  ];
  const files: ProjectFileEntry[] = [];
  let truncated = false;

  while (queue.length > 0 && files.length < MAX_MARKDOWN_FILES) {
    const current = queue.shift();
    if (!current) break;
    if (current.depth > MAX_MARKDOWN_SCAN_DEPTH) {
      truncated = true;
      continue;
    }

    let listing;
    try {
      listing = await projectFileService.listDirectory(
        projectPath,
        current.relativePath,
      );
    } catch {
      continue;
    }
    truncated ||= listing.truncated;

    for (const entry of listing.entries) {
      if (entry.kind === 'directory') {
        queue.push({ relativePath: entry.path, depth: current.depth + 1 });
        continue;
      }
      if (!MARKDOWN_EXTENSION_PATTERN.test(entry.name)) continue;
      files.push(entry);
      if (files.length >= MAX_MARKDOWN_FILES) {
        truncated = true;
        break;
      }
    }
  }

  files.sort((left, right) => {
    const priorityDiff = readmePriority(left.name) - readmePriority(right.name);
    if (priorityDiff !== 0) return priorityDiff;
    return left.path.localeCompare(right.path, 'pt-BR');
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
      return listMarkdownFiles(options.projectFileService, project.path);
    },
  );
};
