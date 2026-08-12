import type {
  CreateEnvironmentProfileInput,
  EnvironmentProfile,
  EnvironmentProfileList,
} from '@dev-dashboard/contracts';

import { requestJson } from './core';

export function fetchEnvironmentProfiles(): Promise<EnvironmentProfileList> {
  return requestJson<EnvironmentProfileList>(
    '/api/settings/environment-profiles',
  );
}

export async function createEnvironmentProfile(
  input: CreateEnvironmentProfileInput,
): Promise<EnvironmentProfile> {
  const { profile } = await requestJson<{ profile: EnvironmentProfile }>(
    '/api/settings/environment-profiles',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
  return profile;
}

export async function updateEnvironmentProfile(
  id: string,
  input: CreateEnvironmentProfileInput,
): Promise<EnvironmentProfile> {
  const { profile } = await requestJson<{ profile: EnvironmentProfile }>(
    `/api/settings/environment-profiles/${encodeURIComponent(id)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
  return profile;
}

export function deleteEnvironmentProfile(id: string): Promise<void> {
  return requestJson<void>(
    `/api/settings/environment-profiles/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  );
}
