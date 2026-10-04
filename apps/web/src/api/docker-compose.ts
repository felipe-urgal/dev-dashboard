import { requestJson } from './core';

export type DockerComposeInspectionState =
  | 'available'
  | 'runtime-unavailable'
  | 'docker-missing'
  | 'compose-unavailable'
  | 'invalid-output';

export type DockerComposeServiceState =
  | 'running'
  | 'exited'
  | 'restarting'
  | 'created'
  | 'paused'
  | 'dead'
  | 'unknown';

export type DockerComposeServiceHealth =
  'healthy' | 'unhealthy' | 'starting' | 'none' | 'unknown';

export interface DockerComposePortBinding {
  targetPort: number;
  publishedPort?: number;
  protocol: 'tcp' | 'udp' | 'unknown';
}

export interface DockerComposeServiceDefinition {
  name: string;
  image?: string;
  profiles: string[];
  dependsOn: string[];
  ports: DockerComposePortBinding[];
}

export interface DockerComposeRuntimeService {
  service: string;
  state: DockerComposeServiceState;
  health: DockerComposeServiceHealth;
  exitCode?: number;
  ports: DockerComposePortBinding[];
}

export interface DockerComposeInspection {
  state: DockerComposeInspectionState;
  observedAt: string;
  config?: {
    projectName?: string;
    observedAt: string;
    services: DockerComposeServiceDefinition[];
  };
  runtime?: {
    observedAt: string;
    services: DockerComposeRuntimeService[];
  };
  diagnostic?: string;
}

export interface DockerComposePreflightConflict {
  port: number;
  services: string[];
  reason: 'occupied' | 'reserved' | 'duplicate-declaration';
  suggestedPort?: number;
}

export interface DockerComposePreflight {
  state: 'ready' | 'blocked' | 'unavailable';
  inspectedAt: string;
  conflicts: DockerComposePreflightConflict[];
  diagnostic?: string;
}

export interface DockerComposeSnapshot {
  inspection: DockerComposeInspection;
  preflight?: DockerComposePreflight;
  ownership: {
    owned: boolean;
    startedAt?: string;
    reconciliation: {
      state: 'unchanged' | 'released' | 'unavailable';
      diagnostic?: string;
    };
  };
}

export interface DockerComposeLogSnapshot {
  content: string;
  truncated: boolean;
  masked: boolean;
  redactionCount: number;
  readAt: string;
}

export type DockerComposeLifecycleOperation = 'start' | 'stop' | 'restart';

export interface DockerComposeLifecycleConfirmation {
  token: string;
  projectId: string;
  environmentInstanceId: string;
  operation: DockerComposeLifecycleOperation;
  service?: string;
  expiresAt: string;
}

export interface DockerComposeLifecycleExecution {
  id: string;
  projectId: string;
  environmentInstanceId: string;
  operation: DockerComposeLifecycleOperation;
  service?: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  stage: 'queued' | 'mutating' | 'completed' | 'failed';
  cancelSupported: false;
  startedAt: string;
  finishedAt?: string;
  resultState?: string;
  diagnostic?: string;
}

interface DockerComposeOperationResponse {
  result: {
    state: string;
    diagnostic?: string;
  };
  snapshot: DockerComposeSnapshot;
}

interface DockerComposeLogsResponse {
  logs: DockerComposeLogSnapshot;
}

interface DockerComposeLifecycleConfirmationResponse {
  confirmation: DockerComposeLifecycleConfirmation;
}

interface DockerComposeLifecycleExecutionResponse {
  execution: DockerComposeLifecycleExecution;
}

interface DockerComposeLatestLifecycleExecutionResponse {
  execution: DockerComposeLifecycleExecution | null;
}

function projectUrl(projectId: string, environmentInstanceId?: string): string {
  const base =
    '/api/projects/' + encodeURIComponent(projectId) + '/docker-compose';
  if (!environmentInstanceId) return base;
  const query = new URLSearchParams({ environmentInstanceId });
  return base + '?' + query.toString();
}

function actionUrl(
  projectId: string,
  action: 'start' | 'stop' | 'restart',
  environmentInstanceId?: string,
): string {
  const base =
    '/api/projects/' +
    encodeURIComponent(projectId) +
    '/docker-compose/' +
    action;
  if (!environmentInstanceId) return base;
  const query = new URLSearchParams({ environmentInstanceId });
  return base + '?' + query.toString();
}

function postTarget(
  projectId: string,
  action: 'stop' | 'restart',
  service?: string,
  environmentInstanceId?: string,
): Promise<DockerComposeOperationResponse> {
  return requestJson<DockerComposeOperationResponse>(
    actionUrl(projectId, action, environmentInstanceId),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service: service ?? null }),
    },
  );
}

export function fetchDockerComposeSnapshot(
  projectId: string,
  environmentInstanceId?: string,
): Promise<DockerComposeSnapshot> {
  return requestJson<DockerComposeSnapshot>(
    projectUrl(projectId, environmentInstanceId),
  );
}

export function startDockerCompose(
  projectId: string,
  environmentInstanceId?: string,
): Promise<DockerComposeOperationResponse> {
  return requestJson<DockerComposeOperationResponse>(
    actionUrl(projectId, 'start', environmentInstanceId),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    },
  );
}

export function stopDockerCompose(
  projectId: string,
  service?: string,
  environmentInstanceId?: string,
): Promise<DockerComposeOperationResponse> {
  return postTarget(projectId, 'stop', service, environmentInstanceId);
}

export function restartDockerCompose(
  projectId: string,
  service?: string,
  environmentInstanceId?: string,
): Promise<DockerComposeOperationResponse> {
  return postTarget(projectId, 'restart', service, environmentInstanceId);
}

export async function fetchDockerComposeLogs(
  projectId: string,
  service?: string,
  tail = 200,
  environmentInstanceId?: string,
): Promise<DockerComposeLogSnapshot> {
  const query = new URLSearchParams({ tail: String(tail) });
  if (environmentInstanceId) {
    query.set('environmentInstanceId', environmentInstanceId);
  }
  if (service) query.set('service', service);
  const response = await requestJson<DockerComposeLogsResponse>(
    '/api/projects/' +
      encodeURIComponent(projectId) +
      '/docker-compose/logs?' +
      query.toString(),
  );
  return response.logs;
}

export async function prepareDockerComposeLifecycleConfirmation(
  projectId: string,
  operation: DockerComposeLifecycleOperation,
  service?: string,
  environmentInstanceId?: string,
): Promise<DockerComposeLifecycleConfirmation> {
  const response =
    await requestJson<DockerComposeLifecycleConfirmationResponse>(
      projectUrl(projectId, environmentInstanceId).replace(/\?.*$/u, '') +
        '/lifecycle-confirmations' +
        (environmentInstanceId
          ? '?' + new URLSearchParams({ environmentInstanceId }).toString()
          : ''),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation, service: service ?? null }),
      },
    );
  return response.confirmation;
}

export async function startDockerComposeLifecycleExecution(
  projectId: string,
  operation: DockerComposeLifecycleOperation,
  confirmationToken: string,
  service?: string,
  environmentInstanceId?: string,
): Promise<DockerComposeLifecycleExecution> {
  const response = await requestJson<DockerComposeLifecycleExecutionResponse>(
    projectUrl(projectId, environmentInstanceId).replace(/\?.*$/u, '') +
      '/lifecycle-executions' +
      (environmentInstanceId
        ? '?' + new URLSearchParams({ environmentInstanceId }).toString()
        : ''),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operation,
        service: service ?? null,
        confirmationToken,
      }),
    },
  );
  return response.execution;
}

export async function fetchDockerComposeLifecycleExecution(
  projectId: string,
  environmentInstanceId?: string,
): Promise<DockerComposeLifecycleExecution | null> {
  const response =
    await requestJson<DockerComposeLatestLifecycleExecutionResponse>(
      projectUrl(projectId, environmentInstanceId).replace(/\?.*$/u, '') +
        '/lifecycle-execution' +
        (environmentInstanceId
          ? '?' + new URLSearchParams({ environmentInstanceId }).toString()
          : ''),
    );
  return response.execution;
}
