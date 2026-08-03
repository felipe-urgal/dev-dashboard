export type ProjectDatabaseSource =
  | 'rails-database-yml'
  | 'dotenv'
  | 'prisma'
  | 'knex';

export type DatabaseReachability = 'reachable' | 'unreachable' | 'unknown';
export type DatabaseRuntime = 'local' | 'docker' | 'stopped' | 'unknown';

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
  /** Existe uma unidade systemd local reconhecida para iniciar, pausar ou reiniciar este banco. */
  serviceAvailable: boolean;
  /** Runtime que atualmente responde pela porta local configurada. */
  runtime: DatabaseRuntime;
  /** Serviços Compose ativos que correspondem ao driver e à porta deste ambiente. */
  dockerServices: string[];
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

export type DatabaseServiceAction = 'start' | 'stop' | 'restart';

export interface ProjectDatabaseServiceActionResult {
  environmentId: string;
  action: DatabaseServiceAction;
  succeeded: boolean;
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
