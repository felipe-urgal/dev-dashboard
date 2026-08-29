import type {
  MachineDatabaseCatalogItem,
  MachineDatabaseConnection,
  MachineDatabaseQueryResult,
  MachineDatabaseTable,
} from '@dev-dashboard/contracts';

import { DatabaseExplorerAdapterError } from './database-explorer-adapter.js';

export type DatabaseExplorerErrorReason =
  | 'unsupported-driver'
  | 'remote-host'
  | 'invalid-connection'
  | 'invalid-query'
  | 'client-unavailable'
  | 'credentials-rejected'
  | 'connection-failed'
  | 'database-unavailable'
  | 'command-failed'
  | 'aborted';

export interface DatabaseExplorerBackend {
  listDatabases(
    connection: MachineDatabaseConnection,
    signal?: AbortSignal,
  ): Promise<MachineDatabaseCatalogItem[]>;
  listTables(
    connection: MachineDatabaseConnection,
    signal?: AbortSignal,
  ): Promise<MachineDatabaseTable[]>;
  preview(
    connection: MachineDatabaseConnection,
    schema: string | undefined,
    table: string,
    signal?: AbortSignal,
  ): Promise<MachineDatabaseQueryResult>;
  query(
    connection: MachineDatabaseConnection,
    query: string,
    signal?: AbortSignal,
  ): Promise<MachineDatabaseQueryResult>;
}

export class DatabaseExplorerError extends Error {
  public constructor(
    public readonly reason: DatabaseExplorerErrorReason,
    message: string,
  ) {
    super(message);
    this.name = 'DatabaseExplorerError';
  }
}

export class DatabaseExplorerService {
  public constructor(private readonly backend: DatabaseExplorerBackend) {}

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof DatabaseExplorerError) throw error;
      if (error instanceof DatabaseExplorerAdapterError) {
        throw new DatabaseExplorerError(error.reason, error.message);
      }
      throw new DatabaseExplorerError(
        'command-failed',
        'Não foi possível consultar o banco de dados.',
      );
    }
  }

  async listDatabases(
    connection: MachineDatabaseConnection,
    signal?: AbortSignal,
  ): Promise<MachineDatabaseCatalogItem[]> {
    return this.execute(() => this.backend.listDatabases(connection, signal));
  }

  async listTables(
    connection: MachineDatabaseConnection,
    signal?: AbortSignal,
  ): Promise<MachineDatabaseTable[]> {
    return this.execute(() => this.backend.listTables(connection, signal));
  }

  async preview(
    connection: MachineDatabaseConnection,
    schema: string | undefined,
    table: string,
    signal?: AbortSignal,
  ): Promise<MachineDatabaseQueryResult> {
    return this.execute(() =>
      this.backend.preview(connection, schema, table, signal),
    );
  }

  async query(
    connection: MachineDatabaseConnection,
    query: string,
    signal?: AbortSignal,
  ): Promise<MachineDatabaseQueryResult> {
    return this.execute(() => this.backend.query(connection, query, signal));
  }
}
