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
  | 'runtime-not-host'
  | 'discovery-not-ready'
  | 'initialize-command-declared'
  | 'compose-ownership-required'
  | 'configuration-kind-unknown';

export type DevContainerLifecycleLimitation = 'post-create-hooks-deferred';

export interface DevContainerLifecyclePreflight {
  projectId: string;
  operation: 'create';
  state: DevContainerLifecyclePreflightState;
  reason: DevContainerLifecyclePreflightReason;
  observedAt: string;
  environmentInstanceId: string;
  runtime: 'host' | 'devcontainer';
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
  operation: 'create';
  expiresAt: string;
}

export interface DevContainerStartResult {
  environmentInstanceId: string;
  runtime: 'devcontainer';
  containerId: string;
}

interface DevContainerLifecycleConfirmationResponse {
  confirmation: DevContainerLifecycleConfirmation;
}

interface DevContainerStartResponse {
  result: DevContainerStartResult;
}

export async function fetchDevContainerInspection(
  projectId: string,
): Promise<DevContainerInspection> {
  const response = await requestJson<DevContainerResponse>(
    '/api/projects/' + encodeURIComponent(projectId) + '/dev-container',
  );
  return response.inspection;
}

export async function fetchDevContainerLifecyclePreflight(
  projectId: string,
  environmentInstanceId?: string,
): Promise<DevContainerLifecyclePreflight> {
  const base =
    '/api/projects/' +
    encodeURIComponent(projectId) +
    '/dev-container/lifecycle-preflight';
  const query = environmentInstanceId
    ? '?' +
      new URLSearchParams({
        environmentInstanceId,
      }).toString()
    : '';
  const response = await requestJson<DevContainerLifecyclePreflightResponse>(
    base + query,
  );
  return response.preflight;
}


function environmentBody(environmentInstanceId?: string): string {
  return JSON.stringify(
    environmentInstanceId ? { environmentInstanceId } : {},
  );
}

export async function prepareDevContainerLifecycleConfirmation(
  projectId: string,
  environmentInstanceId?: string,
): Promise<DevContainerLifecycleConfirmation> {
  const response =
    await requestJson<DevContainerLifecycleConfirmationResponse>(
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

export async function startDevContainer(
  projectId: string,
  confirmationToken: string,
  environmentInstanceId?: string,
): Promise<DevContainerStartResult> {
  const response = await requestJson<DevContainerStartResponse>(
    '/api/projects/' +
      encodeURIComponent(projectId) +
      '/dev-container/start',
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
