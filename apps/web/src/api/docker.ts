import type {
  ComposeServiceAction,
  ComposeServiceActionConfirmation,
  ComposeServiceActionResult,
  ComposeServiceLogs,
  ProjectComposeOverview,
} from '@dev-dashboard/contracts';

import { requestJson } from './core';

interface OverviewResponse { docker: ProjectComposeOverview }
interface ConfirmationResponse { confirmation: ComposeServiceActionConfirmation }
interface ActionResponse { result: ComposeServiceActionResult }
interface LogsResponse { logs: ComposeServiceLogs }

function dockerPath(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/docker`;
}

export async function fetchProjectDocker(projectId: string): Promise<ProjectComposeOverview> {
  const response = await requestJson<OverviewResponse>(dockerPath(projectId));
  return response.docker;
}

export async function prepareComposeServiceAction(
  projectId: string,
  serviceName: string,
  action: 'stop' | 'restart',
): Promise<ComposeServiceActionConfirmation> {
  const response = await requestJson<ConfirmationResponse>(`${dockerPath(projectId)}/confirmations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ serviceName, action }),
  });
  return response.confirmation;
}

export async function runComposeServiceAction(
  projectId: string,
  serviceName: string,
  action: ComposeServiceAction,
  confirmationToken?: string,
): Promise<ComposeServiceActionResult> {
  const response = await requestJson<ActionResponse>(`${dockerPath(projectId)}/actions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ serviceName, action, ...(confirmationToken ? { confirmationToken } : {}) }),
  });
  return response.result;
}

export async function fetchComposeServiceLogs(
  projectId: string,
  serviceName: string,
): Promise<ComposeServiceLogs> {
  const response = await requestJson<LogsResponse>(
    `${dockerPath(projectId)}/services/${encodeURIComponent(serviceName)}/logs`,
  );
  return response.logs;
}
