import type {
  Project
} from "@dev-dashboard/contracts";

import type {
  WorkspaceScanResult
} from "@dev-dashboard/project-discovery";

export interface StoredWorkspaceScan extends WorkspaceScanResult {
  scannedAt: string;
}

const workspaceScans = new Map<string, StoredWorkspaceScan>();

export function saveWorkspaceScan(
  result: WorkspaceScanResult
): StoredWorkspaceScan {
  const storedScan: StoredWorkspaceScan = {
    ...result,
    scannedAt: new Date().toISOString()
  };

  workspaceScans.set(result.workspaceId, storedScan);

  return storedScan;
}

export function listWorkspaceScans(): StoredWorkspaceScan[] {
  return [...workspaceScans.values()].sort((left, right) =>
    left.workspaceId.localeCompare(right.workspaceId)
  );
}

export function listProjects(): Project[] {
  const projectsById = new Map<string, Project>();

  for (const scan of workspaceScans.values()) {
    for (const project of scan.projects) {
      projectsById.set(project.id, project);
    }
  }

  return [...projectsById.values()].sort((left, right) =>
    left.name.localeCompare(right.name)
  );
}
