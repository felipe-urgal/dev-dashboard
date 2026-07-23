import type {
  ManagedProcess,
  Project,
  Workspace,
} from '@dev-dashboard/contracts';

export interface HealthResponse {
  status: string;
  service: string;
  timestamp: string;
}

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

interface WorkspacesResponse {
  workspaces: Workspace[];
}

interface ErrorResponse {
  error?: string;
  message?: string;
}

async function requestJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(input, init);

  const payload: unknown =
    response.status === 204
      ? null
      : await response.json().catch(() => null);

  if (!response.ok) {
    const errorPayload =
      payload && typeof payload === 'object'
        ? (payload as ErrorResponse)
        : null;

    throw new Error(
      errorPayload?.message ??
        `A API respondeu com HTTP ${response.status}`,
    );
  }

  return payload as T;
}

export function fetchHealth(): Promise<HealthResponse> {
  return requestJson<HealthResponse>('/api/health');
}

export async function fetchProjects(): Promise<Project[]> {
  const response =
    await requestJson<ProjectsResponse>('/api/projects');

  return response.projects;
}

export async function fetchWorkspaces(): Promise<Workspace[]> {
  const response =
    await requestJson<WorkspacesResponse>('/api/workspaces');

  return response.workspaces;
}

export function createWorkspace(input: {
  name: string;
  path: string;
}): Promise<Workspace> {
  return requestJson<Workspace>('/api/workspaces', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });
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

export async function deleteWorkspace(
  workspaceId: string,
): Promise<void> {
  await requestJson<null>(
    `/api/workspaces/${encodeURIComponent(workspaceId)}`,
    {
      method: 'DELETE',
    },
  );
}

interface ProcessResponse {
  process: ManagedProcess | null;
}

export async function fetchProjectProcess(
  projectId: string,
): Promise<ManagedProcess | null> {
  const response = await requestJson<ProcessResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/process`,
  );

  return response.process;
}

export async function startProjectProcess(
  projectId: string,
  port?: number,
): Promise<ManagedProcess> {
  const response = await requestJson<ProcessResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/process/start`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(port !== undefined ? { port } : {}),
    },
  );

  if (!response.process) {
    throw new Error('A API não retornou o processo iniciado.');
  }

  return response.process;
}

export async function stopProjectProcess(
  projectId: string,
): Promise<ManagedProcess> {
  const response = await requestJson<ProcessResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/process/stop`,
    {
      method: 'POST',
    },
  );

  if (!response.process) {
    throw new Error('A API não retornou o processo interrompido.');
  }

  return response.process;
}
