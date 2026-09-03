import { readdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';

import type { Project, Workspace } from '@dev-dashboard/contracts';

import { detectProject } from './project-detection.js';

export interface ScanWorkspaceOptions {
  includeUnknown?: boolean;
  /** Ativa a varredura recursiva (opt-in); por padrão só os filhos diretos são escaneados. */
  recursive?: boolean;
  /** Profundidade máxima de subdiretórios explorados quando `recursive` está ativo. */
  maxDepth?: number;
  /** Número máximo de projetos detectados antes de interromper a varredura. */
  maxProjects?: number;
  /** Tempo máximo (ms) da varredura recursiva antes de retornar um resultado parcial. */
  timeoutMs?: number;
  /**
   * Segue links simbólicos ao descer em subdiretórios durante a varredura recursiva.
   * Desativado por padrão para evitar ciclos e travessia para fora do workspace.
   */
  followSymlinks?: boolean;
}

export interface WorkspaceScanWarning {
  path: string;
  code:
    | 'UNREADABLE_DIRECTORY'
    | 'PROJECT_DETECTION_FAILED'
    | 'SCAN_DEPTH_LIMIT_REACHED'
    | 'SCAN_PROJECT_LIMIT_REACHED'
    | 'SCAN_TIMEOUT';
  message: string;
}

export interface WorkspaceScanResult {
  workspaceId: string;
  workspacePath: string;
  projects: Project[];
  warnings: WorkspaceScanWarning[];
}

const DEFAULT_RECURSIVE_MAX_DEPTH = 3;
const DEFAULT_RECURSIVE_MAX_PROJECTS = 200;
const DEFAULT_RECURSIVE_TIMEOUT_MS = 5000;

const IGNORED_DIRECTORIES = new Set([
  '.git',
  '.idea',
  '.vscode',
  'coverage',
  'dist',
  'node_modules',
  'tmp',
]);

interface WalkContext {
  workspaceId: string;
  includeUnknown: boolean | undefined;
  maxDepth: number;
  maxProjects: number;
  followSymlinks: boolean;
  deadlineAt: number;
  projects: Project[];
  warnings: WorkspaceScanWarning[];
  stopped: boolean;
  reportDepthLimit: boolean;
}

function requestStop(
  context: WalkContext,
  code: 'SCAN_PROJECT_LIMIT_REACHED' | 'SCAN_TIMEOUT',
  warningPath: string,
  message: string,
): void {
  if (context.stopped) {
    return;
  }

  context.stopped = true;
  context.warnings.push({ path: warningPath, code, message });
}

async function walkForProjects(
  dirPath: string,
  depth: number,
  context: WalkContext,
): Promise<void> {
  if (context.stopped) {
    return;
  }

  if (Date.now() > context.deadlineAt) {
    requestStop(
      context,
      'SCAN_TIMEOUT',
      dirPath,
      'Tempo limite da varredura recursiva atingido; resultado parcial.',
    );
    return;
  }

  let entries;

  try {
    entries = await readdir(dirPath, { withFileTypes: true });
  } catch (error) {
    context.warnings.push({
      path: dirPath,
      code: 'UNREADABLE_DIRECTORY',
      message:
        error instanceof Error
          ? error.message
          : 'Não foi possível ler o diretório',
    });
    return;
  }

  const candidates = entries
    .filter((entry) => !IGNORED_DIRECTORIES.has(entry.name))
    .filter((entry) => !entry.name.startsWith('.'))
    .sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of candidates) {
    if (context.stopped) {
      return;
    }

    if (context.projects.length >= context.maxProjects) {
      requestStop(
        context,
        'SCAN_PROJECT_LIMIT_REACHED',
        dirPath,
        `Limite de ${context.maxProjects} projetos atingido; resultado parcial.`,
      );
      return;
    }

    if (Date.now() > context.deadlineAt) {
      requestStop(
        context,
        'SCAN_TIMEOUT',
        dirPath,
        'Tempo limite da varredura recursiva atingido; resultado parcial.',
      );
      return;
    }

    const candidatePath = path.join(dirPath, entry.name);

    try {
      if (entry.isSymbolicLink() && !context.followSymlinks) {
        continue;
      }

      const candidateStats = entry.isDirectory()
        ? null
        : await stat(candidatePath);
      const isDirectory =
        entry.isDirectory() || candidateStats?.isDirectory() === true;

      if (!isDirectory) {
        continue;
      }

      const project = await detectProject(candidatePath, {
        workspaceId: context.workspaceId,
        source: 'workspace',
        ...(context.includeUnknown !== undefined
          ? { includeUnknown: context.includeUnknown }
          : {}),
      });

      if (project) {
        context.projects.push(project);
        continue;
      }

      if (depth < context.maxDepth) {
        await walkForProjects(candidatePath, depth + 1, context);
      } else if (context.reportDepthLimit) {
        context.warnings.push({
          path: candidatePath,
          code: 'SCAN_DEPTH_LIMIT_REACHED',
          message: `Profundidade máxima (${context.maxDepth}) atingida; diretório não explorado.`,
        });
      }
    } catch (error) {
      context.warnings.push({
        path: candidatePath,
        code: 'PROJECT_DETECTION_FAILED',
        message:
          error instanceof Error
            ? error.message
            : 'Não foi possível detectar o projeto',
      });
    }
  }
}

function createWalkContext(
  workspaceId: string,
  options: ScanWorkspaceOptions,
): WalkContext {
  if (!options.recursive) {
    return {
      workspaceId,
      includeUnknown: options.includeUnknown,
      maxDepth: 0,
      maxProjects: Infinity,
      followSymlinks: true,
      deadlineAt: Infinity,
      projects: [],
      warnings: [],
      stopped: false,
      reportDepthLimit: false,
    };
  }

  return {
    workspaceId,
    includeUnknown: options.includeUnknown,
    maxDepth: options.maxDepth ?? DEFAULT_RECURSIVE_MAX_DEPTH,
    maxProjects: options.maxProjects ?? DEFAULT_RECURSIVE_MAX_PROJECTS,
    followSymlinks: options.followSymlinks ?? false,
    deadlineAt: Date.now() + (options.timeoutMs ?? DEFAULT_RECURSIVE_TIMEOUT_MS),
    projects: [],
    warnings: [],
    stopped: false,
    reportDepthLimit: true,
  };
}

export async function scanWorkspace(
  workspace: Pick<Workspace, 'id' | 'path'>,
  options: ScanWorkspaceOptions = {},
): Promise<WorkspaceScanResult> {
  const workspacePath = await realpath(workspace.path);
  const context = createWalkContext(workspace.id, options);

  await walkForProjects(workspacePath, 0, context);

  return {
    workspaceId: workspace.id,
    workspacePath,
    projects: context.projects,
    warnings: context.warnings,
  };
}
