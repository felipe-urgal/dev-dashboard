import type { Project } from '@dev-dashboard/contracts';

import type { WorkspaceScanResult } from '@dev-dashboard/project-discovery';

export interface StoredWorkspaceScan extends WorkspaceScanResult {
  scannedAt: string;
}

export class ProjectStore {
  private readonly workspaceScans = new Map<
    string,
    StoredWorkspaceScan
  >();

  public saveWorkspaceScan(
    result: WorkspaceScanResult,
  ): StoredWorkspaceScan {
    const storedScan: StoredWorkspaceScan = {
      ...result,
      scannedAt: new Date().toISOString(),
    };

    this.workspaceScans.set(result.workspaceId, storedScan);

    return storedScan;
  }

  public listWorkspaceScans(): StoredWorkspaceScan[] {
    return [...this.workspaceScans.values()].sort((left, right) =>
      left.workspaceId.localeCompare(right.workspaceId),
    );
  }

  public listProjects(): Project[] {
    const projectsById = new Map<string, Project>();

    for (const scan of this.workspaceScans.values()) {
      for (const project of scan.projects) {
        projectsById.set(project.id, project);
      }
    }

    return [...projectsById.values()].sort((left, right) =>
      left.name.localeCompare(right.name),
    );
  }

  public deleteWorkspaceScan(workspaceId: string): void {
    this.workspaceScans.delete(workspaceId);
  }

  public findProject(projectId: string): Project | null {
    return (
      this.listProjects().find(
        (project) => project.id === projectId,
      ) ?? null
    );
  }

  public setFavorite(
    projectId: string,
    favorite: boolean,
  ): Project | null {
    for (const [workspaceId, scan] of this.workspaceScans) {
      const projectIndex = scan.projects.findIndex(
        (project) => project.id === projectId,
      );

      if (projectIndex < 0) {
        continue;
      }

      const existingProject = scan.projects[projectIndex];

      if (!existingProject) {
        continue;
      }

      const project = {
        ...existingProject,
        favorite,
      };
      const projects = [...scan.projects];
      projects[projectIndex] = project;
      this.workspaceScans.set(workspaceId, {
        ...scan,
        projects,
      });

      return project;
    }

    return null;
  }
}
