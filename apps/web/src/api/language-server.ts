import type { ProjectLanguageServerStatus } from '@dev-dashboard/contracts';

import { requestJson } from './core';

export function fetchProjectLanguageServerStatus(
  projectId: string,
): Promise<ProjectLanguageServerStatus> {
  return requestJson<ProjectLanguageServerStatus>(
    `/api/projects/${encodeURIComponent(projectId)}/language-server`,
  );
}

export function projectLanguageServerWebSocketUrl(projectId: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/api/projects/${encodeURIComponent(projectId)}/language-server/connect`;
}
