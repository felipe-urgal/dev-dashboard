import type { FastifyPluginOptions } from 'fastify';
import type {
  ProjectDisabledRepository,
  ProjectFavoriteRepository,
} from '@dev-dashboard/core';

import type { GitDiffError, GitService } from '../../services/git-service.js';
import type { ProjectStore } from '../../store/project-store.js';

export interface ProjectParams {
  projectId: string;
}

export interface ProjectRouteOptions extends FastifyPluginOptions {
  projectStore: ProjectStore;
  projectFavoriteRepository: ProjectFavoriteRepository;
  projectDisabledRepository: ProjectDisabledRepository;
  gitService: GitService;
}

// Todos os erros de diff são de requisição: caminho fora do projeto, caminho
// que não faz parte do diff, faixa inválida ou arquivo sem conteúdo expansível.
export function gitDiffErrorStatus(error: GitDiffError): number {
  return error.code === 'GIT_DIFF_LINES_UNAVAILABLE' ? 404 : 400;
}

export const projectParamsSchema = {
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
