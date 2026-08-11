import { requestJson } from './core';

export interface ProjectTestPtyStatusSnapshot {
  status: 'running' | 'exited';
  exitCode: number | null;
  exitSignal: number | null;
  startedAt: string;
  endedAt: string | null;
}

interface StatusResponse {
  snapshot: ProjectTestPtyStatusSnapshot | null;
}

export async function fetchProjectTestPtyStatus(
  projectId: string,
): Promise<ProjectTestPtyStatusSnapshot | null> {
  const response = await requestJson<StatusResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/tests/pty/status`,
  );
  return response.snapshot;
}

export async function startProjectTestPty(
  projectId: string,
  commandId: string,
): Promise<ProjectTestPtyStatusSnapshot> {
  const response = await requestJson<{
    snapshot: ProjectTestPtyStatusSnapshot;
  }>(`/api/projects/${encodeURIComponent(projectId)}/tests/pty/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ commandId }),
  });
  return response.snapshot;
}

export async function cancelProjectTestPty(projectId: string): Promise<void> {
  await requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/tests/pty/cancel`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    },
  );
}

export function projectTestPtyWebSocketUrl(projectId: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/api/projects/${encodeURIComponent(projectId)}/tests/pty/connect`;
}
