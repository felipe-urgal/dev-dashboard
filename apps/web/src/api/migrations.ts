import { requestJson } from './core';

export type MigrationOverviewStatus =
  'up-to-date' | 'pending' | 'unavailable' | 'unknown';

export interface MigrationEntry {
  id: string;
  name?: string;
}

export interface MigrationOverview {
  provider: string;
  status: MigrationOverviewStatus;
  database: string;
  applied: MigrationEntry[];
  pending: MigrationEntry[];
  observedAt: string;
  evidence: string;
  warnings: string[];
}

interface MigrationOverviewResponse {
  migration: MigrationOverview;
}

export async function fetchMigrationOverview(
  projectId: string,
  database?: string,
): Promise<MigrationOverview> {
  const query = database ? `?database=${encodeURIComponent(database)}` : '';
  const response = await requestJson<MigrationOverviewResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/migrations${query}`,
  );
  return response.migration;
}
