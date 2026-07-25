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
