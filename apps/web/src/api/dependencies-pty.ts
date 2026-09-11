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

function environmentQuery(environmentInstanceId?: string): string {
  return environmentInstanceId
    ? `?environmentInstanceId=${encodeURIComponent(environmentInstanceId)}`
    : '';
}

export async function fetchProjectDependenciesPtyStatus(
  projectId: string,
  environmentInstanceId?: string,
): Promise<ProjectDependenciesPtyStatusSnapshot | null> {
  const response = await requestJson<StatusResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/dependencies/pty/status${environmentQuery(environmentInstanceId)}`,
  );
  return response.snapshot;
}

export async function startProjectDependenciesPty(
  projectId: string,
  actionId: string,
  environmentInstanceId?: string,
): Promise<ProjectDependenciesPtyStatusSnapshot> {
  const response = await requestJson<{
    snapshot: ProjectDependenciesPtyStatusSnapshot;
  }>(
    `/api/projects/${encodeURIComponent(projectId)}/dependencies/pty/start${environmentQuery(environmentInstanceId)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actionId }),
    },
  );
  return response.snapshot;
}

export async function cancelProjectDependenciesPty(
  projectId: string,
  environmentInstanceId?: string,
): Promise<void> {
  await requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/dependencies/pty/cancel${environmentQuery(environmentInstanceId)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    },
  );
}

export function projectDependenciesPtyWebSocketUrl(
  projectId: string,
  environmentInstanceId?: string,
): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/api/projects/${encodeURIComponent(projectId)}/dependencies/pty/connect${environmentQuery(environmentInstanceId)}`;
}
