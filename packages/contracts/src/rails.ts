export type RailsMigrationStatus = 'up' | 'down';
export type RailsExecutionRuntime = 'auto' | 'local' | 'docker';

export interface RailsMigrationEntry {
  version: string;
  name: string;
  status: RailsMigrationStatus;
}

export interface RailsMigrationsOverview {
  supported: boolean;
  /** Bancos configurados no projeto (ex.: ["primary", "data"]); "primary" sempre está presente. */
  databases: string[];
  database?: string;
  migrations: RailsMigrationEntry[];
  /** Indica se o status foi confirmado consultando o banco ativo. */
  statusAvailable: boolean;
  /** Runtime usado para consultar o Rails; `auto` significa que nenhum comando chegou a executar com sucesso. */
  runtime: RailsExecutionRuntime;
  /** Diagnóstico seguro quando os arquivos existem, mas o banco/runtime não pôde ser consultado. */
  warning?: string;
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
  /** Bancos configurados no projeto (ex.: ["primary", "data"]); "primary" sempre está presente. */
  databases: string[];
  schemaPath?: string;
  tables: RailsSchemaTable[];
}

export type RailsMigrationMutationOperation = 'migrate' | 'rollback' | 'seed' | 'prepare';

export interface RailsMigrationMutationConfirmation {
  token: string;
  operation: RailsMigrationMutationOperation;
  runtime: Exclude<RailsExecutionRuntime, 'auto'>;
  command: string;
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

export type RailsGeneratorKind = 'model' | 'migration';

export type RailsGeneratorFieldType =
  | 'string' | 'text' | 'integer' | 'bigint' | 'float' | 'decimal'
  | 'boolean' | 'date' | 'datetime' | 'time' | 'timestamp' | 'binary'
  | 'references' | 'uuid';

export interface RailsGeneratorField {
  name: string;
  type: RailsGeneratorFieldType;
}

export interface RailsGeneratorConfirmation {
  token: string;
  kind: RailsGeneratorKind;
  name: string;
  fields: RailsGeneratorField[];
  database?: string;
  runtime: Exclude<RailsExecutionRuntime, 'auto'>;
  /** Prévia do comando exato que vai rodar, montado a partir da entrada já validada. */
  command: string;
  expiresAt: string;
}

export interface RailsGeneratorResult {
  kind: RailsGeneratorKind;
  name: string;
  succeeded: boolean;
  createdFiles: string[];
  output: string;
  truncated: boolean;
  masked: boolean;
  redactionCount: number;
}
