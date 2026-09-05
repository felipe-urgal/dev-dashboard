import type { Project } from '@dev-dashboard/contracts';

export type MigrationOverviewStatus =
  | 'up-to-date'
  | 'pending'
  | 'unavailable'
  | 'unknown';

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

export interface MigrationInspectionContext {
  project: Project;
  database?: string;
  now?: () => Date;
}

export interface MigrationProvider {
  readonly id: string;
  supports(project: Project): boolean;
  inspect(context: MigrationInspectionContext): Promise<MigrationOverview>;
}
