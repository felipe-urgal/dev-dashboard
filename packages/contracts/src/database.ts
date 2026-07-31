export type ProjectDatabaseSource =
  | 'rails-database-yml'
  | 'dotenv'
  | 'prisma'
  | 'knex';

export type DatabaseReachability = 'reachable' | 'unreachable' | 'unknown';

export interface ProjectDatabaseEnvironment {
  id: string;
  environment: string;
  driver: string;
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  passwordConfigured: boolean;
  maskedUrl?: string;
  source: ProjectDatabaseSource;
  sourceDetail: string;
  reachability: DatabaseReachability;
  startAvailable: boolean;
}

export interface ProjectDatabaseOverview {
  supported: boolean;
  environments: ProjectDatabaseEnvironment[];
  page: number;
  pageSize: number;
  total: number;
}

export interface ProjectDatabaseSecret {
  environmentId: string;
  databaseUrl: string;
}

export interface ProjectDatabaseStartResult {
  environmentId: string;
  started: boolean;
}

export type DatabaseSnapshotDriver = 'mysql' | 'postgresql';

export interface DatabaseSnapshot {
  id: string;
  environmentId: string;
  environment: string;
  driver: DatabaseSnapshotDriver;
  database: string;
  label: string;
  createdAt: string;
  sizeBytes: number;
}

export interface DatabaseSnapshotList {
  snapshots: DatabaseSnapshot[];
  total: number;
  retentionLimit: number;
  /** Ambientes cujo adaptador e ferramentas de linha de comando permitem dump. */
  supportedEnvironmentIds: string[];
}

export interface DatabaseSnapshotConfirmation {
  token: string;
  snapshotId: string;
  expiresAt: string;
}

export interface DatabaseRestoreResult {
  snapshotId: string;
  restored: boolean;
}
