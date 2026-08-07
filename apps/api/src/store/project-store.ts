import type { Project } from '@dev-dashboard/contracts';
import { ProjectRecentRepository } from '@dev-dashboard/core';

import type { WorkspaceScanResult } from '@dev-dashboard/project-discovery';

export interface StoredWorkspaceScan extends WorkspaceScanResult {
  scannedAt: string;
}

export class ProjectStore {
  private readonly workspaceScans = new Map<string, StoredWorkspaceScan>();

  public constructor(
    private readonly projectRecentRepository = new ProjectRecentRepository(),
  ) {}

  public saveWorkspaceScan(result: WorkspaceScanResult): StoredWorkspaceScan {
    const recentsByProjectId = new Map(
      this.projectRecentRepository
        .list()
        .map((entry) => [entry.projectId, entry]),
    );
    const storedScan: StoredWorkspaceScan = {
      ...result,
      projects: result.projects.map((project) => {
        const recent = recentsByProjectId.get(project.id);
        if (!recent || recent.workspaceId !== result.workspaceId)
          return project;
        return { ...project, lastAccessedAt: recent.lastAccessedAt };
      }),
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
      this.listProjects().find((project) => project.id === projectId) ?? null
    );
  }

  public setFavorite(projectId: string, favorite: boolean): Project | null {
    return this.updateProject(projectId, (project) => ({
      ...project,
      favorite,
    }));
  }

  public setEnabled(projectId: string, enabled: boolean): Project | null {
    return this.updateProject(projectId, (project) => ({
      ...project,
      enabled,
    }));
  }

  public async recordAccess(projectId: string): Promise<Project | null> {
    const project = this.findProject(projectId);
    if (!project?.workspaceId) return null;

    const recent = await this.projectRecentRepository.record(
      project.id,
      project.workspaceId,
    );
    return this.setLastAccessedAt(project.id, recent.lastAccessedAt);
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
