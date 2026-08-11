import type {
  LocalPortInspection,
  ManagedProcess,
  ProcessLogSnapshot,
  ProjectServerHealth,
  ProjectServerSettings,
} from '@dev-dashboard/contracts';

import { followEventStream, requestJson } from './core';

interface ProcessResponse {
  process: ManagedProcess | null;
}

interface ProcessLogResponse {
  log: ProcessLogSnapshot;
}

export interface ProjectServerConfiguration {
  settings: ProjectServerSettings;
  environments: string[];
}

interface ServerHealthResponse {
  health: ProjectServerHealth;
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

export async function fetchProjectServerConfiguration(
  projectId: string,
): Promise<ProjectServerConfiguration> {
  return await requestJson<ProjectServerConfiguration>(
    `/api/projects/${encodeURIComponent(projectId)}/server-settings`,
  );
}

export async function fetchProjectServerSettings(
  projectId: string,
): Promise<ProjectServerSettings> {
  const response = await fetchProjectServerConfiguration(projectId);
  return response.settings;
}

export async function saveProjectServerSettings(
  projectId: string,
  input: {
    port: number | null;
    healthCheckPath: string | null;
    environment: string | null;
  },
): Promise<ProjectServerSettings> {
  const response = await requestJson<ProjectServerConfiguration>(
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

export async function fetchProjectServerHealth(
  projectId: string,
): Promise<ProjectServerHealth> {
  const response = await requestJson<ServerHealthResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/server-health`,
  );

  return response.health;
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

export function followProjectProcessLogEvents(
  projectId: string,
  onEvent: (log: ProcessLogSnapshot) => void,
): { close: () => void; done: Promise<void> } {
  return followEventStream(
    `/api/projects/${encodeURIComponent(projectId)}/process/logs/events`,
    onEvent,
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

export interface ProcessesQuery {
  workspaceId?: string;
  projectId?: string;
  kind?: 'server' | 'test' | 'compose-build';
  signal?: AbortSignal;
}

interface ProcessesResponse {
  processes: ManagedProcess[];
}

export function buildProcessesQuery(query: ProcessesQuery): string {
  const parameters = new URLSearchParams();
  if (query.workspaceId) parameters.set('workspaceId', query.workspaceId);
  if (query.projectId) parameters.set('projectId', query.projectId);
  if (query.kind) parameters.set('kind', query.kind);
  return parameters.toString();
}

export async function fetchManagedProcesses(
  query: ProcessesQuery = {},
): Promise<ManagedProcess[]> {
  const search = buildProcessesQuery(query);
  const url = `/api/processes${search ? `?${search}` : ''}`;
  const init: RequestInit = query.signal ? { signal: query.signal } : {};
  const response = await requestJson<ProcessesResponse>(url, init);
  return response.processes;
}

interface CleanupResponse {
  removed: unknown[];
  removedCount: number;
}

export async function cleanupManagedProcesses(): Promise<number> {
  const response = await requestJson<CleanupResponse>(
    '/api/processes/cleanup',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    },
  );
  return response.removedCount;
}

interface LocalPortsResponse {
  inspection: LocalPortInspection;
}

export async function fetchLocalPorts(
  signal?: AbortSignal,
): Promise<LocalPortInspection> {
  const response = await requestJson<LocalPortsResponse>(
    '/api/ports',
    signal ? { signal } : {},
  );

  return response.inspection;
}
