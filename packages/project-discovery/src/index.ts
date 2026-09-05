import type { Project, Workspace } from '@dev-dashboard/contracts';

import {
  detectProject as detectBaseProject,
  scanWorkspace as scanBaseWorkspace,
} from './discovery.js';
import type {
  DetectProjectOptions,
  ScanWorkspaceOptions,
  WorkspaceScanResult,
} from './discovery.js';
import { enrichProjectProduction } from './production-discovery.js';
import { enrichProjectProfile } from './project-profile.js';

const DEFAULT_RECURSIVE_TIMEOUT_MS = 5000;

async function enrichProject(project: Project): Promise<Project> {
  const production = await enrichProjectProduction(project);
  return enrichProjectProfile(production);
}

export async function detectProject(
  projectPath: string,
  options: DetectProjectOptions = {},
): Promise<Project | null> {
  const project = await detectBaseProject(projectPath, options);
  return project ? enrichProject(project) : null;
}

export async function scanWorkspace(
  workspace: Pick<Workspace, 'id' | 'path'>,
  options: ScanWorkspaceOptions = {},
): Promise<WorkspaceScanResult> {
  const startedAt = Date.now();
  const result = await scanBaseWorkspace(workspace, options);

  if (!options.recursive) {
    return {
      ...result,
      projects: await Promise.all(result.projects.map(enrichProject)),
    };
  }

  if (result.warnings.some((warning) => warning.code === 'SCAN_TIMEOUT')) {
    return result;
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_RECURSIVE_TIMEOUT_MS;
  const remainingMs = Math.max(0, timeoutMs - (Date.now() - startedAt));

  if (remainingMs === 0) {
    return {
      ...result,
      warnings: [
        ...result.warnings,
        {
          path: result.workspacePath,
          code: 'SCAN_TIMEOUT',
          message:
            'Tempo limite da varredura recursiva atingido durante o enriquecimento do projeto; resultado parcial.',
        },
      ],
    };
  }

  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  try {
    const enrichedProjects = await Promise.race([
      Promise.all(result.projects.map(enrichProject)),
      new Promise<null>((resolve) => {
        timeoutHandle = setTimeout(() => resolve(null), remainingMs);
        timeoutHandle.unref?.();
      }),
    ]);

    if (enrichedProjects) {
      return {
        ...result,
        projects: enrichedProjects,
      };
    }

    return {
      ...result,
      warnings: [
        ...result.warnings,
        {
          path: result.workspacePath,
          code: 'SCAN_TIMEOUT',
          message:
            'Tempo limite da varredura recursiva atingido durante o enriquecimento do projeto; resultado parcial.',
        },
      ],
    };
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

export {
  DEFAULT_PROJECT_PROFILE_PROVIDERS,
  detectProjectProfile,
  enrichProjectProfile,
} from './project-profile.js';

export type {
  DetectProjectOptions,
  ScanWorkspaceOptions,
  WorkspaceScanResult,
  WorkspaceScanWarning,
} from './discovery.js';
