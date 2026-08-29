import type {
  MachineDatabaseCatalogItem,
  MachineDatabaseConnection,
  MachineDatabaseQueryResult,
  MachineDatabaseTable,
} from '@dev-dashboard/contracts';

import {
  type DatabaseCommandRunner,
  type DatabaseExplorerAdapter,
  validateDatabaseIdentifier,
} from './database-explorer-adapter.js';
import {
  DATABASE_COMMAND_TIMEOUT_MS,
  defaultDatabaseCommandRunner,
  runDatabaseCliCommand,
} from './database-explorer-cli.js';

const POSTGRES_READ_ONLY_OPTIONS = `-c default_transaction_read_only=on -c statement_timeout=${DATABASE_COMMAND_TIMEOUT_MS}`;
const MAX_ROWS = 100;

function quoteIdentifier(value: string, label: string): string {
  return `"${validateDatabaseIdentifier(value, label)}"`;
}

export class PostgresExplorerAdapter implements DatabaseExplorerAdapter {
  public constructor(
    private readonly commandRunner: DatabaseCommandRunner =
      defaultDatabaseCommandRunner,
  ) {}

  private run(
    connection: MachineDatabaseConnection,
    sql: string,
    signal?: AbortSignal,
  ): Promise<MachineDatabaseQueryResult> {
    const host = connection.host?.trim() || '127.0.0.1';
    const port = connection.port ?? 5432;
    const database = connection.database?.trim() || 'postgres';
    const env = {
      ...process.env,
      PGHOST: host,
      PGPORT: String(port),
      PGOPTIONS: POSTGRES_READ_ONLY_OPTIONS,
      ...(connection.username ? { PGUSER: connection.username } : {}),
      ...(connection.password ? { PGPASSWORD: connection.password } : {}),
      PGDATABASE: database,
    };

    return runDatabaseCliCommand({
      command: 'psql',
      args: [
        '-X',
        '-A',
        '-F',
        '\t',
        '-P',
        'footer=off',
        '-v',
        'ON_ERROR_STOP=1',
        '-c',
        sql,
      ],
      env,
      runner: this.commandRunner,
      signal,
    });
  }

  async listDatabases(
    connection: MachineDatabaseConnection,
    signal?: AbortSignal,
  ): Promise<MachineDatabaseCatalogItem[]> {
    const result = await this.run(
      connection,
      'SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname',
      signal,
    );
    return result.rows
      .map((row) => ({ name: String(row[0] ?? '') }))
      .filter((item) => item.name);
  }

  async listTables(
    connection: MachineDatabaseConnection,
    signal?: AbortSignal,
  ): Promise<MachineDatabaseTable[]> {
    const result = await this.run(
      connection,
      "SELECT table_schema, table_name FROM information_schema.tables WHERE table_type = 'BASE TABLE' AND table_schema NOT IN ('pg_catalog', 'information_schema') ORDER BY table_schema, table_name",
      signal,
    );
    return result.rows.map((row) => ({
      schema: String(row[0] ?? ''),
      name: String(row[1] ?? ''),
    }));
  }

  preview(
    connection: MachineDatabaseConnection,
    schema: string | undefined,
    table: string,
    signal?: AbortSignal,
  ): Promise<MachineDatabaseQueryResult> {
    const target = schema
      ? `${quoteIdentifier(schema, 'Schema')}.${quoteIdentifier(table, 'Tabela')}`
      : quoteIdentifier(table, 'Tabela');
    return this.run(connection, `SELECT * FROM ${target} LIMIT ${MAX_ROWS + 1}`, signal);
  }

  query(
    connection: MachineDatabaseConnection,
    query: string,
    signal?: AbortSignal,
  ): Promise<MachineDatabaseQueryResult> {
    return this.run(connection, query, signal);
  }
}
