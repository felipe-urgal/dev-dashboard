import type {
  MachineDatabaseCatalogItem,
  MachineDatabaseConnection,
  MachineDatabaseQueryResult,
  MachineDatabaseTable,
} from '@dev-dashboard/contracts';
import { createConnection } from 'mysql2/promise';

import {
  DatabaseExplorerAdapterError,
  type DatabaseExplorerAdapter,
  validateDatabaseIdentifier,
} from './database-explorer-adapter.js';
import {
  DATABASE_QUERY_TIMEOUT_MS,
  mapDatabaseDriverError,
  runAbortableDatabaseOperation,
  toDatabaseQueryResult,
} from './database-explorer-driver.js';

const MAX_ROWS = 100;

type MysqlConnectionConfig = Parameters<typeof createConnection>[0];

export interface MysqlExplorerClient {
  query(
    query: string | { sql: string; rowsAsArray: true; timeout: number },
  ): Promise<[unknown, Array<{ name: string }>]>;
  end(): Promise<void>;
  destroy(): void;
}

export type MysqlExplorerClientFactory = (
  config: MysqlConnectionConfig,
) => Promise<MysqlExplorerClient>;

const defaultMysqlClientFactory: MysqlExplorerClientFactory = async (config) =>
  (await createConnection(config)) as unknown as MysqlExplorerClient;

function quoteIdentifier(value: string, label: string): string {
  return `\`${validateDatabaseIdentifier(value, label)}\``;
}

export class MysqlExplorerAdapter implements DatabaseExplorerAdapter {
  public constructor(
    private readonly clientFactory: MysqlExplorerClientFactory = defaultMysqlClientFactory,
  ) {}

  private async run(
    connection: MachineDatabaseConnection,
    sql: string,
    signal?: AbortSignal,
  ): Promise<MachineDatabaseQueryResult> {
    if (signal?.aborted) {
      throw new DatabaseExplorerAdapterError('aborted', 'Consulta cancelada.');
    }

    let client: MysqlExplorerClient | undefined;
    let transactionStarted = false;
    let terminated = false;
    const terminate = () => {
      terminated = true;
      client?.destroy();
    };

    try {
      const result = await runAbortableDatabaseOperation({
        operation: (async () => {
          client = await this.clientFactory({
            host: connection.host?.trim() || '127.0.0.1',
            port: connection.port ?? 3306,
            ...(connection.username ? { user: connection.username } : {}),
            ...(connection.password ? { password: connection.password } : {}),
            ...(connection.database?.trim()
              ? { database: connection.database.trim() }
              : {}),
            connectTimeout: DATABASE_QUERY_TIMEOUT_MS,
            rowsAsArray: true,
            dateStrings: true,
            supportBigNumbers: true,
            bigNumberStrings: true,
          });
          if (terminated) {
            client.destroy();
            throw new DatabaseExplorerAdapterError(
              'aborted',
              'Consulta cancelada.',
            );
          }

          await client.query('START TRANSACTION READ ONLY');
          transactionStarted = true;
          const [rows, fields] = await client.query({
            sql,
            rowsAsArray: true,
            timeout: DATABASE_QUERY_TIMEOUT_MS,
          });
          if (!Array.isArray(rows)) {
            throw new DatabaseExplorerAdapterError(
              'command-failed',
              'O banco não retornou um conjunto tabular de leitura.',
            );
          }
          return {
            columns: fields.map((field) => field.name),
            rows: rows as unknown[][],
          };
        })(),
        ...(signal ? { signal } : {}),
        terminate,
      });

      return toDatabaseQueryResult(result.columns, result.rows);
    } catch (error) {
      throw mapDatabaseDriverError(error, signal);
    } finally {
      if (client && !terminated) {
        if (transactionStarted) {
          await client.query('ROLLBACK').catch(() => undefined);
        }
        await client.end().catch(() => undefined);
      }
    }
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
