import type { Project, Workspace } from '@dev-dashboard/contracts';

import { requestJson } from './core';

export interface WorkspaceScanWarning {
  path: string;
  code: string;
  message: string;
}

export interface WorkspaceScanResponse {
  workspaceId: string;
  workspacePath: string;
  projects: Project[];
  warnings: WorkspaceScanWarning[];
  scannedAt: string;
}

interface ProjectsResponse {
  projects: Project[];
}

interface ProjectResponse {
  project: Project;
}

interface WorkspacesResponse {
  workspaces: Workspace[];
}

export interface DirectoryEntry {
  name: string;
  path: string;
}

export interface DirectoryListing {
  rootPath: string;
  currentPath: string;
  parentPath: string | null;
  directories: DirectoryEntry[];
}

export async function fetchProject(projectId: string): Promise<Project> {
  const response = await requestJson<ProjectResponse>(
    `/api/projects/${encodeURIComponent(projectId)}`,
  );

  return response.project;
}

export async function fetchProjects(): Promise<Project[]> {
  const response = await requestJson<ProjectsResponse>('/api/projects');

  return response.projects;
}

export async function recordProjectAccess(projectId: string): Promise<Project> {
  const response = await requestJson<ProjectResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/access`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: '{}',
    },
  );

  return response.project;
}

export async function updateProjectEnabled(
  projectId: string,
  enabled: boolean,
): Promise<Project> {
  const response = await requestJson<ProjectResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/enabled`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ enabled }),
    },
  );

  return response.project;
}

export async function fetchWorkspaces(): Promise<Workspace[]> {
  const response = await requestJson<WorkspacesResponse>('/api/workspaces');

  return response.workspaces;
}

export function createWorkspace(input: {
  name: string;
  path: string;
  recursiveScan?: boolean;
}): Promise<Workspace> {
  return requestJson<Workspace>('/api/workspaces', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });
}

export function updateWorkspaceRecursiveScan(
  workspaceId: string,
  recursiveScan: boolean,
): Promise<Workspace> {
  return requestJson<Workspace>(
    `/api/workspaces/${encodeURIComponent(workspaceId)}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ recursiveScan }),
    },
  );
}

export function scanWorkspace(
  workspaceId: string,
): Promise<WorkspaceScanResponse> {
  return requestJson<WorkspaceScanResponse>(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/scan`,
    {
      method: 'POST',
    },
  );
}

export async function deleteWorkspace(workspaceId: string): Promise<void> {
  await requestJson<null>(
    `/api/workspaces/${encodeURIComponent(workspaceId)}`,
    {
      method: 'DELETE',
    },
  );
}

export function projectFaviconUrl(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/favicon`;
}

export function fetchDirectories(
  directoryPath?: string,
): Promise<DirectoryListing> {
  const parameters = new URLSearchParams();

  if (directoryPath) {
    parameters.set('path', directoryPath);
  }

  const query = parameters.toString();

  return requestJson<DirectoryListing>(
    `/api/directories${query ? `?${query}` : ''}`,
  );
}
