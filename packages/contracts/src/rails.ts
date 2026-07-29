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

export interface RailsMigrationDetail {
  supported: boolean;
  version: string;
  name?: string;
  status?: RailsMigrationStatus;
  filePath?: string;
  source?: string;
  truncated: boolean;
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

export interface RailsSchemaColumn {
  name: string;
  type: string;
  nullable: boolean;
  primaryKey: boolean;
  default?: string;
  limit?: number;
  precision?: number;
  scale?: number;
}

export interface RailsSchemaIndex {
  name?: string;
  columns: string[];
  unique: boolean;
}

export interface RailsSchemaForeignKey {
  fromTable: string;
  toTable: string;
  column: string;
  primaryKey?: string;
  name?: string;
}

export interface RailsSchemaTable {
  name: string;
  columns: RailsSchemaColumn[];
  indexes: RailsSchemaIndex[];
  foreignKeys: RailsSchemaForeignKey[];
}

export interface RailsModelsOverview {
  supported: boolean;
  schemaPath?: string;
  tables: RailsSchemaTable[];
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
