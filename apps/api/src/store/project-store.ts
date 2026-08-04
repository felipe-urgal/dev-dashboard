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
    return this.updateProject(projectId, (project) => ({
      ...project,
      favorite,
    }));
  }

  public setLastAccessedAt(
    projectId: string,
    lastAccessedAt: string,
  ): Project | null {
    return this.updateProject(projectId, (project) => ({
      ...project,
      lastAccessedAt,
    }));
  }

  private updateProject(
    projectId: string,
    update: (project: Project) => Project,
  ): Project | null {
    let updatedProject: Project | null = null;

    for (const [workspaceId, scan] of this.workspaceScans) {
      let scanChanged = false;
      const projects = scan.projects.map((project) => {
        if (project.id !== projectId) return project;
        const updated = update(project);
        updatedProject ??= updated;
        scanChanged = true;
        return updated;
      });

      if (scanChanged) {
        this.workspaceScans.set(workspaceId, { ...scan, projects });
      }
    }

    return updatedProject;
  }
}
