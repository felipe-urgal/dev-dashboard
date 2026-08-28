import type {
  MachineDatabaseCatalogItem,
  MachineDatabaseConnection,
  MachineDatabaseQueryResult,
  MachineDatabaseTable,
} from '@dev-dashboard/contracts';

import {
  DatabaseReadonlyError,
  type DatabaseReadonlyService,
} from './database-readonly-service.js';

export type DatabaseExplorerErrorReason = DatabaseReadonlyError['reason'];

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
  public constructor(
    private readonly databaseReadonlyService: DatabaseReadonlyService,
  ) {}

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof DatabaseExplorerError) throw error;
      if (error instanceof DatabaseReadonlyError) {
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
    return this.execute(() =>
      this.databaseReadonlyService.listDatabases(connection, signal),
    );
  }

  async listTables(
    connection: MachineDatabaseConnection,
    signal?: AbortSignal,
  ): Promise<MachineDatabaseTable[]> {
    return this.execute(() =>
      this.databaseReadonlyService.listTables(connection, signal),
    );
  }

  async preview(
    connection: MachineDatabaseConnection,
    schema: string | undefined,
    table: string,
    signal?: AbortSignal,
  ): Promise<MachineDatabaseQueryResult> {
    return this.execute(() =>
      this.databaseReadonlyService.preview(
        connection,
        schema,
        table,
        signal,
      ),
    );
  }

  async query(
    connection: MachineDatabaseConnection,
    query: string,
    signal?: AbortSignal,
  ): Promise<MachineDatabaseQueryResult> {
    return this.execute(() =>
      this.databaseReadonlyService.query(connection, query, signal),
    );
  }
}
