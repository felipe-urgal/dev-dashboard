import type {
  ManagedProcess,
  ProcessLogSnapshot,
  Project,
  ProjectServerSettings,
  ProjectGitOverview,
  ProjectTestOverview,
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

interface ProjectResponse {
  project: Project;
}

interface WorkspacesResponse {
  workspaces: Workspace[];
}

interface ErrorResponse {
  error?: string;
  message?: string;
}

export class ApiRequestError extends Error {
  public readonly status: number;
  public readonly code: string | undefined;

  public constructor(options: {
    status: number;
    code?: string;
    message: string;
  }) {
    super(options.message);
    this.name = 'ApiRequestError';
    this.status = options.status;
    this.code = options.code;
  }
}

interface ProcessResponse {
  process: ManagedProcess | null;
}

interface ProcessLogResponse {
  log: ProcessLogSnapshot;
}

interface ServerSettingsResponse {
  settings: ProjectServerSettings;
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

    throw new ApiRequestError({
      status: response.status,
      ...(errorPayload?.error
        ? { code: errorPayload.error }
        : {}),
      message:
        errorPayload?.message ??
        `A API respondeu com HTTP ${response.status}`,
    });
  }

  return payload as T;
}

export function fetchHealth(): Promise<HealthResponse> {
  return requestJson<HealthResponse>('/api/health');
}

export async function fetchProject(
  projectId: string,
): Promise<Project> {
  const response = await requestJson<ProjectResponse>(
    `/api/projects/${encodeURIComponent(projectId)}`,
  );

  return response.project;
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
  input: {
    port?: number | null;
  } = {},
): Promise<ManagedProcess> {
  const response = await requestJson<ProcessResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/process/start`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    },
  );

  if (!response.process) {
    throw new Error('A API não retornou o processo iniciado.');
  }

  return response.process;
}

export async function fetchProjectServerSettings(
  projectId: string,
): Promise<ProjectServerSettings> {
  const response = await requestJson<ServerSettingsResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/server-settings`,
  );

  return response.settings;
}

export async function saveProjectServerSettings(
  projectId: string,
  input: {
    port: number | null;
  },
): Promise<ProjectServerSettings> {
  const response = await requestJson<ServerSettingsResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/server-settings`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    },
  );

  return response.settings;
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

export async function fetchProjectProcessLog(
  projectId: string,
  maxBytes = 65_536,
): Promise<ProcessLogSnapshot> {
  const parameters = new URLSearchParams({
    maxBytes: String(maxBytes),
  });

  const response = await requestJson<ProcessLogResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/process/logs?${parameters}`,
  );

  return response.log;
}
export function projectFaviconUrl(
  projectId: string,
): string {
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

export async function clearProjectProcessLog(
  projectId: string,
): Promise<ProcessLogSnapshot> {
  const response = await requestJson<ProcessLogResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/process/logs`,
    {
      method: 'DELETE',
    },
  );

  return response.log;
}


interface ProjectGitResponse { git: ProjectGitOverview; }
export async function fetchProjectGit(projectId: string): Promise<ProjectGitOverview> {
  const response = await requestJson<ProjectGitResponse>(`/api/projects/${encodeURIComponent(projectId)}/git`);
  return response.git;
}

interface ProjectTestsResponse { tests: ProjectTestOverview; }

export async function fetchProjectTests(
  projectId: string,
  options: { refresh?: boolean } = {},
): Promise<ProjectTestOverview> {
  const query = options.refresh ? '?refresh=true' : '';
  const response = await requestJson<ProjectTestsResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/tests${query}`,
  );
  return response.tests;
}

export async function fetchProjectTestProcess(
  projectId: string,
): Promise<ManagedProcess | null> {
  const response = await requestJson<ProcessResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/tests/process`,
  );
  return response.process;
}

export async function startProjectTest(
  projectId: string,
  commandId: string,
): Promise<ManagedProcess> {
  const response = await requestJson<ProcessResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/tests/${encodeURIComponent(commandId)}/start`,
    { method: 'POST' },
  );
  if (!response.process) {
    throw new Error('A API não retornou o processo iniciado.');
  }
  return response.process;
}

export async function stopProjectTest(
  projectId: string,
): Promise<ManagedProcess> {
  const response = await requestJson<ProcessResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/tests/process/stop`,
    { method: 'POST' },
  );
  if (!response.process) {
    throw new Error('A API não retornou o processo interrompido.');
  }
  return response.process;
}

export async function fetchProjectTestLog(
  projectId: string,
  maxBytes = 65_536,
): Promise<ProcessLogSnapshot> {
  const parameters = new URLSearchParams({ maxBytes: String(maxBytes) });
  const response = await requestJson<ProcessLogResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/tests/process/logs?${parameters}`,
  );
  return response.log;
}

export async function clearProjectTestLog(
  projectId: string,
): Promise<ProcessLogSnapshot> {
  const response = await requestJson<ProcessLogResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/tests/process/logs`,
    { method: 'DELETE' },
  );
  return response.log;
}
