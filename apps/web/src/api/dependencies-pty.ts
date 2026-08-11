import { requestJson } from './core';

export interface ProjectDependenciesPtyStatusSnapshot {
  actionId: string;
  actionName: string;
  status: 'running' | 'exited';
  exitCode: number | null;
  exitSignal: number | null;
  startedAt: string;
  endedAt: string | null;
}

interface StatusResponse {
  snapshot: ProjectDependenciesPtyStatusSnapshot | null;
}

export async function fetchProjectDependenciesPtyStatus(
  projectId: string,
): Promise<ProjectDependenciesPtyStatusSnapshot | null> {
  const response = await requestJson<StatusResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/dependencies/pty/status`,
  );
  return response.snapshot;
}

export async function startProjectDependenciesPty(
  projectId: string,
  actionId: string,
): Promise<ProjectDependenciesPtyStatusSnapshot> {
  const response = await requestJson<{
    snapshot: ProjectDependenciesPtyStatusSnapshot;
  }>(`/api/projects/${encodeURIComponent(projectId)}/dependencies/pty/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ actionId }),
  });
  return response.snapshot;
}

export async function cancelProjectDependenciesPty(
  projectId: string,
): Promise<void> {
  await requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/dependencies/pty/cancel`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    },
  );
}

export function projectDependenciesPtyWebSocketUrl(projectId: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/api/projects/${encodeURIComponent(projectId)}/dependencies/pty/connect`;
}
