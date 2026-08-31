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

export async function detectProject(
  projectPath: string,
  options: DetectProjectOptions = {},
): Promise<Project | null> {
  const project = await detectBaseProject(projectPath, options);
  return project ? enrichProjectProduction(project) : null;
}

export async function scanWorkspace(
  workspace: Pick<Workspace, 'id' | 'path'>,
  options: ScanWorkspaceOptions = {},
): Promise<WorkspaceScanResult> {
  const result = await scanBaseWorkspace(workspace, options);

  return {
    ...result,
    projects: await Promise.all(result.projects.map(enrichProjectProduction)),
  };
}

export type {
  DetectProjectOptions,
  ScanWorkspaceOptions,
  WorkspaceScanResult,
  WorkspaceScanWarning,
} from './discovery.js';
