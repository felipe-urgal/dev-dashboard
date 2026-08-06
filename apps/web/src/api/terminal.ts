import type {
  ProjectTerminalConfirmation,
  ProjectTerminalKind,
  ProjectTerminalStatus,
} from '@dev-dashboard/contracts';

import { requestJson } from './core';

export function fetchProjectTerminalStatus(
  projectId: string,
  kind: ProjectTerminalKind,
): Promise<ProjectTerminalStatus> {
  return requestJson<ProjectTerminalStatus>(
    `/api/projects/${encodeURIComponent(projectId)}/terminal/${kind}`,
  );
}

export function prepareProjectTerminalConfirmation(
  projectId: string,
  kind: ProjectTerminalKind,
): Promise<ProjectTerminalConfirmation> {
  return requestJson<{ confirmation: ProjectTerminalConfirmation }>(
    `/api/projects/${encodeURIComponent(projectId)}/terminal/${kind}/confirmations`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    },
  ).then((response) => response.confirmation);
}

export function projectTerminalWebSocketUrl(
  projectId: string,
  kind: ProjectTerminalKind,
  confirmationToken: string,
): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const query = new URLSearchParams({ confirmationToken }).toString();
  return `${protocol}//${window.location.host}/api/projects/${encodeURIComponent(projectId)}/terminal/${kind}/connect?${query}`;
}
