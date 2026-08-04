import type {
  ProjectLanguageServerKind,
  ProjectLanguageServerStatus,
  ProjectRailsRuntimeConfirmation,
} from '@dev-dashboard/contracts';

import { requestJson } from './core';

export function fetchProjectLanguageServerStatus(
  projectId: string,
  kind: ProjectLanguageServerKind,
): Promise<ProjectLanguageServerStatus> {
  return requestJson<ProjectLanguageServerStatus>(
    `/api/projects/${encodeURIComponent(projectId)}/language-server/${kind}`,
  );
}

export function projectLanguageServerWebSocketUrl(
  projectId: string,
  kind: ProjectLanguageServerKind,
): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/api/projects/${encodeURIComponent(projectId)}/language-server/${kind}/connect`;
}

export function prepareProjectRailsRuntimeConfirmation(
  projectId: string,
): Promise<ProjectRailsRuntimeConfirmation> {
  return requestJson<{ confirmation: ProjectRailsRuntimeConfirmation }>(
    `/api/projects/${encodeURIComponent(projectId)}/language-server/ruby/rails-runtime/confirmations`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) },
  ).then((response) => response.confirmation);
}

export function setProjectRailsRuntimeEnabled(
  projectId: string,
  enabled: boolean,
  confirmationToken?: string,
): Promise<ProjectLanguageServerStatus> {
  return requestJson<ProjectLanguageServerStatus>(
    `/api/projects/${encodeURIComponent(projectId)}/language-server/ruby/rails-runtime`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enabled,
        ...(confirmationToken ? { confirmationToken } : {}),
      }),
    },
  );
}
