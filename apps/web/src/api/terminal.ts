import type {
  ProjectTerminalConfirmation,
  ProjectTerminalKind,
  ProjectTerminalStatus,
} from '@dev-dashboard/contracts';

import { requestJson } from './core';

function terminalQuery(
  environmentInstanceId?: string,
  confirmationToken?: string,
): string {
  const query = new URLSearchParams({
    ...(environmentInstanceId ? { environmentInstanceId } : {}),
    ...(confirmationToken ? { confirmationToken } : {}),
  }).toString();
  return query ? `?${query}` : '';
}

export function fetchProjectTerminalStatus(
  projectId: string,
  kind: ProjectTerminalKind,
  environmentInstanceId?: string,
): Promise<ProjectTerminalStatus> {
  return requestJson<ProjectTerminalStatus>(
    `/api/projects/${encodeURIComponent(projectId)}/terminal/${kind}${terminalQuery(environmentInstanceId)}`,
  );
}

export function prepareProjectTerminalConfirmation(
  projectId: string,
  kind: ProjectTerminalKind,
  environmentInstanceId?: string,
): Promise<ProjectTerminalConfirmation> {
  return requestJson<{ confirmation: ProjectTerminalConfirmation }>(
    `/api/projects/${encodeURIComponent(projectId)}/terminal/${kind}/confirmations${terminalQuery(environmentInstanceId)}`,
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
  environmentInstanceId?: string,
): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const query = terminalQuery(environmentInstanceId, confirmationToken);
  return `${protocol}//${window.location.host}/api/projects/${encodeURIComponent(projectId)}/terminal/${kind}/connect${query}`;
}
