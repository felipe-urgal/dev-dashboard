import type {
  MachineDatabaseCatalogItem,
  MachineDatabaseConnection,
  MachineDatabaseQueryResult,
  MachineDatabaseTable,
} from '@dev-dashboard/contracts';
import { Client, type ClientConfig } from 'pg';

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

interface PostgresQueryResult {
  fields: Array<{ name: string }>;
  rows: unknown[][];
}

export interface PostgresExplorerClient {
  connect(): Promise<void>;
  query(sql: string): Promise<unknown>;
  query(options: {
    text: string;
    rowMode: 'array';
  }): Promise<PostgresQueryResult>;
  end(): Promise<void>;
}

export type PostgresExplorerClientFactory = (
  config: ClientConfig,
) => PostgresExplorerClient;

const defaultPostgresClientFactory: PostgresExplorerClientFactory = (config) =>
  new Client(config) as unknown as PostgresExplorerClient;

function quoteIdentifier(value: string, label: string): string {
  return `"${validateDatabaseIdentifier(value, label)}"`;
}

export class PostgresExplorerAdapter implements DatabaseExplorerAdapter {
  public constructor(
    private readonly clientFactory: PostgresExplorerClientFactory = defaultPostgresClientFactory,
  ) {}

  private async run(
    connection: MachineDatabaseConnection,
    sql: string,
    signal?: AbortSignal,
  ): Promise<MachineDatabaseQueryResult> {
    if (signal?.aborted) {
      throw new DatabaseExplorerAdapterError('aborted', 'Consulta cancelada.');
    }

    const client = this.clientFactory({
      host: connection.host?.trim() || '127.0.0.1',
      port: connection.port ?? 5432,
      ...(connection.username ? { user: connection.username } : {}),
      ...(connection.password ? { password: connection.password } : {}),
      database: connection.database?.trim() || 'postgres',
      connectionTimeoutMillis: DATABASE_QUERY_TIMEOUT_MS,
      statement_timeout: DATABASE_QUERY_TIMEOUT_MS,
      query_timeout: DATABASE_QUERY_TIMEOUT_MS,
      application_name: 'dev-dashboard',
    });

    let connected = false;
    let transactionStarted = false;
    let terminated = false;
    const terminate = () => {
      if (terminated) return;
      terminated = true;
      void client.end().catch(() => undefined);
    };

    try {
      const result = await runAbortableDatabaseOperation({
        operation: (async () => {
          await client.connect();
          connected = true;
          await client.query('BEGIN READ ONLY');
          transactionStarted = true;
          return client.query({ text: sql, rowMode: 'array' });
        })(),
        ...(signal ? { signal } : {}),
        terminate,
      });

      return toDatabaseQueryResult(
        result.fields.map((field) => field.name),
        result.rows,
      );
    } catch (error) {
      throw mapDatabaseDriverError(error, signal);
    } finally {
      if (!terminated && connected) {
        if (transactionStarted) {
          await client.query('ROLLBACK').catch(() => undefined);
        }
        await client.end().catch(() => undefined);
      } else if (!terminated) {
        terminate();
      }
    }
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
