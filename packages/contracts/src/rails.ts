export type RailsMigrationStatus = 'up' | 'down';

export interface RailsMigrationEntry {
  version: string;
  name: string;
  status: RailsMigrationStatus;
}

export interface RailsMigrationsOverview {
  supported: boolean;
  database?: string;
  migrations: RailsMigrationEntry[];
}

export interface RailsRouteEntry {
  name?: string;
  verb: string;
  path: string;
  controllerAction: string;
}

export interface RailsRoutesOverview {
  supported: boolean;
  routes: RailsRouteEntry[];
}

export type RailsMigrationMutationOperation = 'migrate' | 'rollback' | 'seed' | 'prepare';

export interface RailsMigrationMutationConfirmation {
  token: string;
  operation: RailsMigrationMutationOperation;
  expiresAt: string;
}

export interface RailsMigrationMutationResult {
  operation: RailsMigrationMutationOperation;
  succeeded: boolean;
  output: string;
  truncated: boolean;
  masked: boolean;
  redactionCount: number;
}
