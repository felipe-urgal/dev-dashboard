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
  defaultDatabaseCommandRunner,
  runDatabaseCliCommand,
} from './database-explorer-cli.js';

const MYSQL_READ_ONLY_INIT_COMMAND = 'SET SESSION TRANSACTION READ ONLY';
const MAX_ROWS = 100;

function quoteIdentifier(value: string, label: string): string {
  return `\`${validateDatabaseIdentifier(value, label)}\``;
}

export class MysqlExplorerAdapter implements DatabaseExplorerAdapter {
  public constructor(
    private readonly commandRunner: DatabaseCommandRunner = defaultDatabaseCommandRunner,
  ) {}

  private run(
    connection: MachineDatabaseConnection,
    sql: string,
    signal?: AbortSignal,
  ): Promise<MachineDatabaseQueryResult> {
    const host = connection.host?.trim() || '127.0.0.1';
    const port = connection.port ?? 3306;
    const database = connection.database?.trim();
    const env = {
      ...process.env,
      MYSQL_HOST: host,
      MYSQL_TCP_PORT: String(port),
      ...(connection.username ? { MYSQL_USER: connection.username } : {}),
      ...(connection.password ? { MYSQL_PWD: connection.password } : {}),
      ...(database ? { MYSQL_DATABASE: database } : {}),
    };

    return runDatabaseCliCommand({
      command: 'mysql',
      args: [
        '--no-defaults',
        '--protocol=tcp',
        '--host',
        host,
        '--port',
        String(port),
        ...(connection.username ? ['--user', connection.username] : []),
        '--column-names',
        '--batch',
        '--raw',
        `--init-command=${MYSQL_READ_ONLY_INIT_COMMAND}`,
        '--execute',
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
      'SELECT schema_name FROM information_schema.schemata ORDER BY schema_name',
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
      "SELECT table_schema, table_name FROM information_schema.tables WHERE table_type = 'BASE TABLE' ORDER BY table_schema, table_name",
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
    return this.run(
      connection,
      `SELECT * FROM ${target} LIMIT ${MAX_ROWS + 1}`,
      signal,
    );
  }

  query(
    connection: MachineDatabaseConnection,
    query: string,
    signal?: AbortSignal,
  ): Promise<MachineDatabaseQueryResult> {
    return this.run(connection, query, signal);
  }
}
