import type { Project } from '@dev-dashboard/contracts';
import { ProjectRecentRepository } from '@dev-dashboard/core';

import type { WorkspaceScanResult } from '@dev-dashboard/project-discovery';

export interface StoredWorkspaceScan extends WorkspaceScanResult {
  scannedAt: string;
}

export class ProjectStore {
  private readonly workspaceScans = new Map<string, StoredWorkspaceScan>();
  /**
   * projectId -> workspaceIds dos scans que atualmente contêm esse projeto,
   * na ordem em que cada associação apareceu pela primeira vez. Mantido
   * incrementalmente para que `findProject`/`updateProject` não precisem
   * varrer todos os workspaces a cada chamada — só os que de fato contêm o
   * projeto. Um projeto pode aparecer em mais de um scan (workspaces que se
   * sobrepõem), daí ser um conjunto e não uma entrada única.
   */
  private readonly projectWorkspaces = new Map<string, Set<string>>();

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

    this.reindexWorkspaceScan(result.workspaceId, storedScan);
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
    const scan = this.workspaceScans.get(workspaceId);
    if (scan) {
      for (const project of scan.projects) {
        this.removeProjectWorkspace(project.id, workspaceId);
      }
    }
    this.workspaceScans.delete(workspaceId);
  }

  public removeProject(projectId: string): Project | null {
    const project = this.findProject(projectId);
    const workspaceIds = this.projectWorkspaces.get(projectId);

    if (!project || !workspaceIds || workspaceIds.size === 0) {
      return null;
    }

    for (const workspaceId of [...workspaceIds]) {
      const scan = this.workspaceScans.get(workspaceId);
      if (!scan) continue;

      this.workspaceScans.set(workspaceId, {
        ...scan,
        projects: scan.projects.filter((item) => item.id !== projectId),
      });
      this.removeProjectWorkspace(projectId, workspaceId);
    }

    return project;
  }

  public findProject(projectId: string): Project | null {
    const workspaceIds = this.projectWorkspaces.get(projectId);
    if (!workspaceIds || workspaceIds.size === 0) return null;

    const lastWorkspaceId = [...workspaceIds].at(-1);
    const scan = lastWorkspaceId
      ? this.workspaceScans.get(lastWorkspaceId)
      : undefined;

    return scan?.projects.find((project) => project.id === projectId) ?? null;
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
    const workspaceIds = this.projectWorkspaces.get(projectId);
    if (!workspaceIds || workspaceIds.size === 0) return null;

    let updatedProject: Project | null = null;

    for (const workspaceId of workspaceIds) {
      const scan = this.workspaceScans.get(workspaceId);
      if (!scan) continue;

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

  /**
   * Atualiza o índice `projectWorkspaces` para refletir os projetos do novo
   * scan de `workspaceId`, adicionando só as associações novas e removendo
   * só as que deixaram de existir — nunca remove e readiciona uma
   * associação que persiste entre scans, para não alterar a ordem relativa
   * usada por `updateProject` ao escolher qual ocorrência retornar.
   */
  private reindexWorkspaceScan(
    workspaceId: string,
    nextScan: StoredWorkspaceScan,
  ): void {
    const previousScan = this.workspaceScans.get(workspaceId);
    const previousIds = new Set(
      previousScan?.projects.map((project) => project.id) ?? [],
    );
    const nextIds = new Set(nextScan.projects.map((project) => project.id));

    for (const projectId of previousIds) {
      if (!nextIds.has(projectId)) {
        this.removeProjectWorkspace(projectId, workspaceId);
      }
    }
    for (const projectId of nextIds) {
      if (!previousIds.has(projectId)) {
        this.addProjectWorkspace(projectId, workspaceId);
      }
    }
  }

  private addProjectWorkspace(projectId: string, workspaceId: string): void {
    let workspaceIds = this.projectWorkspaces.get(projectId);
    if (!workspaceIds) {
      workspaceIds = new Set();
      this.projectWorkspaces.set(projectId, workspaceIds);
    }
    workspaceIds.add(workspaceId);
  }

  private removeProjectWorkspace(projectId: string, workspaceId: string): void {
    const workspaceIds = this.projectWorkspaces.get(projectId);
    if (!workspaceIds) return;
    workspaceIds.delete(workspaceId);
    if (workspaceIds.size === 0) this.projectWorkspaces.delete(projectId);
  }
}
