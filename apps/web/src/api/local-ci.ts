import { requestJson } from './core';

export type LocalCiAvailabilityState =
  | 'available'
  | 'act-missing'
  | 'docker-unavailable';

export interface LocalCiAvailability {
  state: LocalCiAvailabilityState;
  actVersion?: string;
  dockerVersion?: string;
}

export interface LocalCiCatalogJob {
  workflowFile: string;
  workflow: string;
  jobId: string;
  job: string;
  events: string[];
}

export interface LocalCiCatalog {
  provider: 'act';
  approximation: true;
  availability: LocalCiAvailability;
  jobs: LocalCiCatalogJob[];
}

export interface LocalCiJobRequest {
  workflowFile: string;
  jobId: string;
  event: string;
}

export interface LocalCiExecutionSnapshot {
  id: string;
  projectId: string;
  provider: 'act';
  approximation: true;
  request: LocalCiJobRequest;
  status: 'running' | 'exited';
  logs: string;
  truncated: boolean;
  exitCode: number | null;
  exitSignal: number | null;
  timedOut: boolean;
  startedAt: string;
  endedAt: string | null;
}

interface CatalogResponse {
  catalog: LocalCiCatalog;
}

interface RunResponse {
  run: LocalCiExecutionSnapshot;
}

function localCiPath(projectId: string): string {
  return '/api/projects/' + encodeURIComponent(projectId) + '/local-ci';
}

export async function fetchLocalCiCatalog(
  projectId: string,
): Promise<LocalCiCatalog> {
  const response = await requestJson<CatalogResponse>(
    localCiPath(projectId) + '/catalog',
  );
  return response.catalog;
}

export async function startLocalCiRun(
  projectId: string,
  request: LocalCiJobRequest,
): Promise<LocalCiExecutionSnapshot> {
  const response = await requestJson<RunResponse>(
    localCiPath(projectId) + '/runs',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workflowFile: request.workflowFile,
        jobId: request.jobId,
        event: request.event,
      }),
    },
  );
  return response.run;
}

export async function fetchLocalCiRun(
  projectId: string,
  runId: string,
): Promise<LocalCiExecutionSnapshot> {
  const response = await requestJson<RunResponse>(
    localCiPath(projectId) + '/runs/' + encodeURIComponent(runId),
  );
  return response.run;
}

export async function cancelLocalCiRun(
  projectId: string,
  runId: string,
): Promise<void> {
  await requestJson(
    localCiPath(projectId) +
      '/runs/' +
      encodeURIComponent(runId) +
      '/cancel',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    },
  );
}

export function localCiWebSocketUrl(
  projectId: string,
  runId: string,
): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return (
    protocol +
    '//' +
    window.location.host +
    localCiPath(projectId) +
    '/runs/' +
    encodeURIComponent(runId) +
    '/connect'
  );
}
