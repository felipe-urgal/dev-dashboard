import type {
  ServiceLifecycleAction,
  ServiceLifecyclePlan,
  ServiceRuntimeProfileKind,
  ServiceRuntimeProfileView,
} from '@dev-dashboard/contracts';

import { requestJson } from './core';

export interface RuntimeProfilesResponse {
  projectId: string;
  environmentInstanceId: string;
  revision: string;
  bindingsRevision: string;
  fallback: boolean;
  profiles: ServiceRuntimeProfileView[];
}

export interface RuntimeProfileDraft {
  kind: ServiceRuntimeProfileKind;
  bindingIds: string[];
  expectedRevision: string;
  expectedBindingsRevision: string;
}

function collectionPath(projectId: string, environmentInstanceId: string): string {
  return '/api/projects/' + encodeURIComponent(projectId) +
    '/environments/' + encodeURIComponent(environmentInstanceId) +
    '/service-profiles';
}

export function fetchRuntimeProfiles(
  projectId: string,
  environmentInstanceId: string,
): Promise<RuntimeProfilesResponse> {
  return requestJson(collectionPath(projectId, environmentInstanceId));
}

export function saveRuntimeProfile(
  projectId: string,
  environmentInstanceId: string,
  draft: RuntimeProfileDraft,
  profileId?: string,
): Promise<{ profile: ServiceRuntimeProfileView; revision: string; bindingsRevision: string }> {
  const url = collectionPath(projectId, environmentInstanceId) +
    (profileId ? '/' + encodeURIComponent(profileId) : '');
  return requestJson(url, {
    method: profileId ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(draft),
  });
}

export function removeRuntimeProfile(
  projectId: string,
  environmentInstanceId: string,
  profileId: string,
  expectedRevision: string,
): Promise<{ revision: string }> {
  return requestJson(
    collectionPath(projectId, environmentInstanceId) +
      '/' + encodeURIComponent(profileId) +
      '?expectedRevision=' + encodeURIComponent(expectedRevision),
    { method: 'DELETE' },
  );
}

export function fetchRuntimeProfilePlan(
  projectId: string,
  environmentInstanceId: string,
  action: ServiceLifecycleAction,
  profileId?: string,
): Promise<ServiceLifecyclePlan> {
  const query = new URLSearchParams({ action, environmentInstanceId });
  if (profileId) query.set('profileId', profileId);
  return requestJson(
    '/api/projects/' + encodeURIComponent(projectId) + '/service-plan?' + query.toString(),
  );
}
