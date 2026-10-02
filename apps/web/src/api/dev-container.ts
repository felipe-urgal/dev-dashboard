import { requestJson } from './core';

export type DevContainerInspectionState =
  | 'not-configured'
  | 'available'
  | 'cli-missing'
  | 'unavailable'
  | 'invalid-output';

export type DevContainerConfigurationKind =
  'image' | 'dockerfile' | 'compose' | 'unknown';

export type DevContainerLifecycleHook =
  | 'initializeCommand'
  | 'onCreateCommand'
  | 'updateContentCommand'
  | 'postCreateCommand'
  | 'postStartCommand'
  | 'postAttachCommand';

export interface DevContainerInspection {
  state: DevContainerInspectionState;
  observedAt: string;
  configSource?: '.devcontainer/devcontainer.json' | '.devcontainer.json';
  cliVersion?: string;
  configuration?: {
    kind: DevContainerConfigurationKind;
    name?: string;
    service?: string;
    lifecycleHooks: DevContainerLifecycleHook[];
  };
  diagnostic?: string;
}

export type DevContainerLifecyclePreflightState =
  'review' | 'blocked' | 'unavailable';

export type DevContainerLifecyclePreflightReason =
  | 'review-required'
  | 'rebuild-ownership-required'
  | 'discovery-not-ready'
  | 'initialize-command-declared'
  | 'compose-ownership-required'
  | 'configuration-kind-unknown'
  | 'lifecycle-in-progress'
  | 'recovery-required';

export type DevContainerLifecycleLimitation = 'post-create-hooks-deferred';

export type DevContainerEnvironmentLifecycle =
  'stopped' | 'starting' | 'ready' | 'degraded' | 'stopping' | 'failed';

export interface DevContainerLifecyclePreflight {
  projectId: string;
  operation: 'create' | 'rebuild';
  state: DevContainerLifecyclePreflightState;
  reason: DevContainerLifecyclePreflightReason;
  observedAt: string;
  environmentInstanceId: string;
  runtime: 'host' | 'devcontainer';
  environmentLifecycle: DevContainerEnvironmentLifecycle;
  stopAvailable: boolean;
  recoveryAvailable: boolean;
  executionEnabled: false;
  requiresConfirmation: boolean;
  discoveryState?: DevContainerInspectionState;
  configSource?: '.devcontainer/devcontainer.json' | '.devcontainer.json';
  cliVersion?: string;
  configuration?: {
    kind: DevContainerConfigurationKind;
    name?: string;
    service?: string;
    lifecycleHooks: DevContainerLifecycleHook[];
  };
  limitations: DevContainerLifecycleLimitation[];
  diagnostic: string;
}

interface DevContainerResponse {
  inspection: DevContainerInspection;
}

interface DevContainerLifecyclePreflightResponse {
  preflight: DevContainerLifecyclePreflight;
}

export interface DevContainerLifecycleConfirmation {
  token: string;
  environmentInstanceId: string;
  operation: 'create' | 'rebuild';
  expiresAt: string;
}

export interface DevContainerStartResult {
  environmentInstanceId: string;
  runtime: 'devcontainer';
  containerId: string;
}

export interface DevContainerStopConfirmation {
  token: string;
  environmentInstanceId: string;
  expiresAt: string;
}

export interface DevContainerStopResult {
  state: 'cleaned' | 'already-absent';
  environmentInstanceId: string;
  containerId?: string;
}

export type DevContainerLifecycleExecutionOperation =
  'create' | 'rebuild' | 'stop' | 'recover';

export type DevContainerLifecycleExecutionStatus =
  'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface DevContainerLifecycleExecution {
  id: string;
  projectId: string;
  environmentInstanceId: string;
  operation: DevContainerLifecycleExecutionOperation;
  status: DevContainerLifecycleExecutionStatus;
  stage: string;
  cancelSupported: boolean;
  startedAt: string;
  finishedAt?: string;
  diagnostic?: string;
}

interface DevContainerLifecycleConfirmationResponse {
  confirmation: DevContainerLifecycleConfirmation;
}

interface DevContainerStartResponse {
  result: DevContainerStartResult;
}

interface DevContainerStopConfirmationResponse {
  confirmation: DevContainerStopConfirmation;
}

interface DevContainerStopResponse {
  result: DevContainerStopResult;
}

function environmentQuery(environmentInstanceId?: string): string {
  const query = new URLSearchParams();
  if (environmentInstanceId) {
    query.set('environmentInstanceId', environmentInstanceId);
  }
  const encoded = query.toString();
  return encoded ? `?${encoded}` : '';
}

export async function fetchDevContainerInspection(
  projectId: string,
  environmentInstanceId?: string,
): Promise<DevContainerInspection> {
  const response = await requestJson<DevContainerResponse>(
    '/api/projects/' +
      encodeURIComponent(projectId) +
      '/dev-container' +
      environmentQuery(environmentInstanceId),
  );
  return response.inspection;
}

export async function fetchDevContainerLifecyclePreflight(
  projectId: string,
  environmentInstanceId?: string,
): Promise<DevContainerLifecyclePreflight> {
  const response = await requestJson<DevContainerLifecyclePreflightResponse>(
    '/api/projects/' +
      encodeURIComponent(projectId) +
      '/dev-container/lifecycle-preflight' +
      environmentQuery(environmentInstanceId),
  );
  return response.preflight;
}

function environmentBody(environmentInstanceId?: string): string {
  return JSON.stringify(environmentInstanceId ? { environmentInstanceId } : {});
}

export async function prepareDevContainerLifecycleConfirmation(
  projectId: string,
  environmentInstanceId?: string,
): Promise<DevContainerLifecycleConfirmation> {
  const response = await requestJson<DevContainerLifecycleConfirmationResponse>(
    '/api/projects/' +
      encodeURIComponent(projectId) +
      '/dev-container/lifecycle-confirmation',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: environmentBody(environmentInstanceId),
    },
  );
  return response.confirmation;
}

export async function startDevContainerLifecycleExecution(
  projectId: string,
  operation: DevContainerLifecycleExecutionOperation,
  confirmationToken: string,
  environmentInstanceId?: string,
): Promise<DevContainerLifecycleExecution> {
  const response = await requestJson<{
    execution: DevContainerLifecycleExecution;
  }>(
    '/api/projects/' +
      encodeURIComponent(projectId) +
      '/dev-container/lifecycle-executions',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operation,
        ...(environmentInstanceId ? { environmentInstanceId } : {}),
        confirmationToken,
      }),
    },
  );
  return response.execution;
}

export async function fetchDevContainerLifecycleExecution(
  projectId: string,
  environmentInstanceId?: string,
): Promise<DevContainerLifecycleExecution | null> {
  const response = await requestJson<{
    execution: DevContainerLifecycleExecution | null;
  }>(
    '/api/projects/' +
      encodeURIComponent(projectId) +
      '/dev-container/lifecycle-execution' +
      environmentQuery(environmentInstanceId),
  );
  return response.execution;
}

export async function cancelDevContainerLifecycleExecution(
  projectId: string,
  environmentInstanceId?: string,
): Promise<void> {
  await requestJson(
    '/api/projects/' +
      encodeURIComponent(projectId) +
      '/dev-container/lifecycle-execution/cancel',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: environmentBody(environmentInstanceId),
    },
  );
}

export async function startDevContainer(
  projectId: string,
  confirmationToken: string,
  environmentInstanceId?: string,
): Promise<DevContainerStartResult> {
  const response = await requestJson<DevContainerStartResponse>(
    '/api/projects/' + encodeURIComponent(projectId) + '/dev-container/start',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(environmentInstanceId ? { environmentInstanceId } : {}),
        confirmationToken,
      }),
    },
  );
  return response.result;
}

export async function rebuildDevContainer(
  projectId: string,
  confirmationToken: string,
  environmentInstanceId?: string,
): Promise<DevContainerStartResult> {
  const response = await requestJson<DevContainerStartResponse>(
    '/api/projects/' + encodeURIComponent(projectId) + '/dev-container/rebuild',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(environmentInstanceId ? { environmentInstanceId } : {}),
        confirmationToken,
      }),
    },
  );
  return response.result;
}

export async function prepareDevContainerStopConfirmation(
  projectId: string,
  environmentInstanceId?: string,
): Promise<DevContainerStopConfirmation> {
  const response = await requestJson<DevContainerStopConfirmationResponse>(
    '/api/projects/' +
      encodeURIComponent(projectId) +
      '/dev-container/stop-confirmation',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: environmentBody(environmentInstanceId),
    },
  );
  return response.confirmation;
}

export async function stopDevContainer(
  projectId: string,
  confirmationToken: string,
  environmentInstanceId?: string,
): Promise<DevContainerStopResult> {
  const response = await requestJson<DevContainerStopResponse>(
    '/api/projects/' + encodeURIComponent(projectId) + '/dev-container/stop',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(environmentInstanceId ? { environmentInstanceId } : {}),
        confirmationToken,
      }),
    },
  );
  return response.result;
}
