import { requestJson } from './core';

export type DevContainerInspectionState =
  | 'not-configured'
  | 'available'
  | 'cli-missing'
  | 'unavailable'
  | 'invalid-output';

export type DevContainerConfigurationKind =
  | 'image'
  | 'dockerfile'
  | 'compose'
  | 'unknown';

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

interface DevContainerResponse {
  inspection: DevContainerInspection;
}

export async function fetchDevContainerInspection(
  projectId: string,
): Promise<DevContainerInspection> {
  const response = await requestJson<DevContainerResponse>(
    '/api/projects/' + encodeURIComponent(projectId) + '/dev-container',
  );
  return response.inspection;
}
