import type {
  MachineDatabaseCatalogItem,
  MachineDatabaseConnection,
  MachineDatabaseQueryResult,
  MachineDatabaseTable,
} from '@dev-dashboard/contracts';

export type DatabaseExplorerAdapterErrorReason =
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

export class DatabaseExplorerAdapterError extends Error {
  public constructor(
    public readonly reason: DatabaseExplorerAdapterErrorReason,
    message: string,
  ) {
    super(message);
    this.name = 'DatabaseExplorerAdapterError';
  }
}

export interface DatabaseExplorerAdapter {
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

export function validateDatabaseIdentifier(
  value: string,
  label: string,
): string {
  if (!/^[A-Za-z0-9_$-]+$/.test(value) || value.length > 128) {
    throw new DatabaseExplorerAdapterError(
      'invalid-query',
      `${label} inválido.`,
    );
  }
  return value;
}
