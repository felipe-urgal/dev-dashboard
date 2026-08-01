import type {
  RailsMigrationDetail,
  RailsModelsOverview,
} from '@dev-dashboard/contracts';

import { ApiRequestError } from './api';

interface ErrorResponse {
  error?: string;
  message?: string;
}

async function requestRailsJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: 'same-origin' });
  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const errorPayload = payload && typeof payload === 'object'
      ? payload as ErrorResponse
      : null;
    throw new ApiRequestError({
      status: response.status,
      ...(errorPayload?.error ? { code: errorPayload.error } : {}),
      message: errorPayload?.message ?? `A API respondeu com HTTP ${response.status}`,
    });
  }

  return payload as T;
}

export async function fetchProjectRailsMigrationDetail(
  projectId: string,
  version: string,
  database?: string,
): Promise<RailsMigrationDetail> {
  const query = database ? `?${new URLSearchParams({ database })}` : '';
  const response = await requestRailsJson<{ migration: RailsMigrationDetail }>(
    `/api/projects/${encodeURIComponent(projectId)}/rails/migrations/${encodeURIComponent(version)}${query}`,
  );
  return response.migration;
}

export async function fetchProjectRailsModels(
  projectId: string,
  database?: string,
): Promise<RailsModelsOverview> {
  const query = database ? `?${new URLSearchParams({ database })}` : '';
  const response = await requestRailsJson<{ models: RailsModelsOverview }>(
    `/api/projects/${encodeURIComponent(projectId)}/rails/models${query}`,
  );
  return response.models;
}
