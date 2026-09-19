import type { ActivitySnapshot } from '@dev-dashboard/contracts';

import { requestJson } from './core';

interface ActivityResponse {
  activity: ActivitySnapshot;
}

function activityQuery(limit: number): string {
  const parameters = new URLSearchParams({ limit: String(limit) });
  return parameters.toString();
}

export async function fetchActivity(
  limit = 100,
  signal?: AbortSignal,
): Promise<ActivitySnapshot> {
  const response = await requestJson<ActivityResponse>(
    `/api/activity?${activityQuery(limit)}`,
    signal ? { signal } : {},
  );
  return response.activity;
}

export async function fetchProjectActivity(
  projectId: string,
  limit = 100,
  signal?: AbortSignal,
): Promise<ActivitySnapshot> {
  const response = await requestJson<ActivityResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/activity?${activityQuery(limit)}`,
    signal ? { signal } : {},
  );
  return response.activity;
}
