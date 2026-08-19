import type {
  RailsMigrationDetail,
  RailsModelsOverview,
} from '@dev-dashboard/contracts';

import { requestJson } from './api';

async function requestRailsJson<T>(url: string): Promise<T> {
  return requestJson<T>(url);
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
