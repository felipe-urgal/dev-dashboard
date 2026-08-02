import type {
  ComposeServiceAction,
  ComposeServiceActionConfirmation,
  ComposeServiceActionResult,
  ComposeServiceLogs,
  ManagedProcess,
  ProcessLogSnapshot,
  ProjectComposeOverview,
} from '@dev-dashboard/contracts';

import { requestJson } from './core';

interface OverviewResponse { docker: ProjectComposeOverview }
interface ConfirmationResponse { confirmation: ComposeServiceActionConfirmation }
interface ActionResponse { result: ComposeServiceActionResult }
interface LogsResponse { logs: ComposeServiceLogs }
interface BuildProcessResponse { process: ManagedProcess | null }
interface BuildLogResponse { log: ProcessLogSnapshot }

function dockerPath(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/docker`;
}

function buildPath(projectId: string, serviceName: string): string {
  return `${dockerPath(projectId)}/services/${encodeURIComponent(serviceName)}/build`;
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

export async function fetchComposeServiceBuild(
  projectId: string,
  serviceName: string,
): Promise<ManagedProcess | null> {
  const response = await requestJson<BuildProcessResponse>(buildPath(projectId, serviceName));
  return response.process;
}

export async function startComposeServiceBuild(
  projectId: string,
  serviceName: string,
): Promise<ManagedProcess> {
  const response = await requestJson<BuildProcessResponse>(`${buildPath(projectId, serviceName)}/start`, {
    method: 'POST',
  });
  if (!response.process) {
    throw new Error('A API não retornou o build iniciado.');
  }
  return response.process;
}

export async function stopComposeServiceBuild(
  projectId: string,
  serviceName: string,
): Promise<ManagedProcess> {
  const response = await requestJson<BuildProcessResponse>(`${buildPath(projectId, serviceName)}/stop`, {
    method: 'POST',
  });
  if (!response.process) {
    throw new Error('A API não retornou o build interrompido.');
  }
  return response.process;
}

export async function fetchComposeServiceBuildLog(
  projectId: string,
  serviceName: string,
): Promise<ProcessLogSnapshot> {
  const response = await requestJson<BuildLogResponse>(`${buildPath(projectId, serviceName)}/logs`);
  return response.log;
}

export async function clearComposeServiceBuildLog(
  projectId: string,
  serviceName: string,
): Promise<ProcessLogSnapshot> {
  const response = await requestJson<BuildLogResponse>(`${buildPath(projectId, serviceName)}/logs`, {
    method: 'DELETE',
  });
  return response.log;
}
