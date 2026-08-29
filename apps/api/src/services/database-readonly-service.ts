import type {
  MachineDatabaseCatalogItem,
  MachineDatabaseConnection,
  MachineDatabaseQueryResult,
  MachineDatabaseTable,
} from '@dev-dashboard/contracts';

import {
  createDatabaseReadonlyAdapters,
  DATABASE_MAX_ROWS,
  defaultDatabaseCommandRunner,
  type DatabaseCommandRunner,
  type DatabaseReadonlyAdapter,
} from './database-readonly-adapters.js';
import { DatabaseReadonlyError } from './database-readonly-error.js';

export { DatabaseReadonlyError } from './database-readonly-error.js';

const MAX_QUERY_LENGTH = 4_000;
const localHosts = new Set(['localhost', '127.0.0.1', '::1']);

const blockedPostgresFunctions =
  /\b(?:nextval|setval|pg_sleep|pg_notify|pg_advisory_(?:xact_)?lock(?:_shared)?|pg_cancel_backend|pg_terminate_backend|pg_reload_conf|pg_rotate_logfile|pg_create_restore_point|lo_import|lo_export|dblink_exec)\s*\(/i;
const blockedMysqlFunctions =
  /\b(?:get_lock|release_lock|load_file|sleep|benchmark)\s*\(/i;

function validateConnection(connection: MachineDatabaseConnection): void {
  if (!['mysql', 'mariadb', 'postgresql'].includes(connection.driver)) {
    throw new DatabaseReadonlyError(
      'unsupported-driver',
      'Este explorador suporta somente MySQL, MariaDB e PostgreSQL.',
    );
  }
  const host = connection.host?.trim() || '127.0.0.1';
  if (!localHosts.has(host)) {
    throw new DatabaseReadonlyError(
      'remote-host',
      'Por segurança, o explorador aceita apenas bancos locais nesta versão.',
    );
  }
  if (
    connection.port !== undefined &&
    (!Number.isInteger(connection.port) ||
      connection.port < 1 ||
      connection.port > 65535)
  ) {
    throw new DatabaseReadonlyError(
      'invalid-connection',
      'A porta informada é inválida.',
    );
  }
}

function safeIdentifier(value: string, label: string): string {
  if (!/^[A-Za-z0-9_$-]+$/.test(value) || value.length > 128) {
    throw new DatabaseReadonlyError('invalid-query', `${label} inválido.`);
  }
  return value;
}

function quoteIdentifier(
  value: string,
  driver: MachineDatabaseConnection['driver'],
): string {
  const identifier = safeIdentifier(value, 'Identificador');
  return driver === 'postgresql' ? `"${identifier}"` : `\`${identifier}\``;
}

function rejectUnsafeReadConstructs(
  query: string,
  driver: MachineDatabaseConnection['driver'],
): void {
  if (/\bfor\s+(?:no\s+key\s+update|key\s+share|update|share)\b/i.test(query)) {
    throw new DatabaseReadonlyError(
      'invalid-query',
      'Consultas com bloqueio explícito de linhas não são permitidas.',
    );
  }

  if (driver === 'postgresql') {
    if (/\binto\b/i.test(query) || blockedPostgresFunctions.test(query)) {
      throw new DatabaseReadonlyError(
        'invalid-query',
        'A consulta usa uma construção com efeito colateral bloqueada no modo somente leitura.',
      );
    }
    return;
  }

  if (
    /\binto\s+(?:out|dump)file\b/i.test(query) ||
    blockedMysqlFunctions.test(query)
  ) {
    throw new DatabaseReadonlyError(
      'invalid-query',
      'A consulta usa uma construção com efeito colateral bloqueada no modo somente leitura.',
    );
  }
}

function readOnlyQuery(
  query: string,
  driver: MachineDatabaseConnection['driver'],
): string {
  const normalized = query.trim().replace(/;\s*$/, '');
  if (!normalized || normalized.length > MAX_QUERY_LENGTH) {
    throw new DatabaseReadonlyError(
      'invalid-query',
      'Informe uma consulta de até 4.000 caracteres.',
    );
  }
  if (!/^(select|with)\b/i.test(normalized) || /;|--|\/\*/.test(normalized)) {
    throw new DatabaseReadonlyError(
      'invalid-query',
      'Somente uma consulta SELECT/WITH, sem comandos múltiplos, é permitida.',
    );
  }
  if (
    /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|replace|call|execute|copy)\b/i.test(
      normalized,
    )
  ) {
    throw new DatabaseReadonlyError(
      'invalid-query',
      'A consulta contém uma operação de escrita ou administração bloqueada.',
    );
  }
  rejectUnsafeReadConstructs(normalized, driver);
  return normalized;
}

export class DatabaseReadonlyService {
  private readonly adapters: Record<
    'postgresql' | 'mysql' | 'mariadb',
    DatabaseReadonlyAdapter
  >;

  public constructor(
    commandRunner: DatabaseCommandRunner = defaultDatabaseCommandRunner,
  ) {
    this.adapters = createDatabaseReadonlyAdapters(commandRunner);
  }

  private async run(
    connection: MachineDatabaseConnection,
    sql: string,
    signal?: AbortSignal,
  ): Promise<MachineDatabaseQueryResult> {
    validateConnection(connection);
    return this.adapters[connection.driver].execute(connection, sql, signal);
  }

  async listDatabases(
    connection: MachineDatabaseConnection,
    signal?: AbortSignal,
  ): Promise<MachineDatabaseCatalogItem[]> {
    const sql =
      connection.driver === 'postgresql'
        ? 'SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname'
        : 'SELECT schema_name FROM information_schema.schemata ORDER BY schema_name';
    const result = await this.run(connection, sql, signal);
    return result.rows
      .map((row) => ({ name: String(row[0] ?? '') }))
      .filter((item) => item.name);
  }

  async listTables(
    connection: MachineDatabaseConnection,
    signal?: AbortSignal,
  ): Promise<MachineDatabaseTable[]> {
    const sql =
      connection.driver === 'postgresql'
        ? "SELECT table_schema, table_name FROM information_schema.tables WHERE table_type = 'BASE TABLE' AND table_schema NOT IN ('pg_catalog', 'information_schema') ORDER BY table_schema, table_name"
        : "SELECT table_schema, table_name FROM information_schema.tables WHERE table_type = 'BASE TABLE' ORDER BY table_schema, table_name";
    const result = await this.run(connection, sql, signal);
    return result.rows.map((row) => ({
      schema: String(row[0] ?? ''),
      name: String(row[1] ?? ''),
    }));
  }

  async preview(
    connection: MachineDatabaseConnection,
    schema: string | undefined,
    table: string,
    signal?: AbortSignal,
  ): Promise<MachineDatabaseQueryResult> {
    const target = schema
      ? `${quoteIdentifier(schema, connection.driver)}.${quoteIdentifier(table, connection.driver)}`
      : quoteIdentifier(table, connection.driver);
    return this.run(
      connection,
      `SELECT * FROM ${target} LIMIT ${DATABASE_MAX_ROWS + 1}`,
      signal,
    );
  }

  async query(
    connection: MachineDatabaseConnection,
    query: string,
    signal?: AbortSignal,
  ): Promise<MachineDatabaseQueryResult> {
    return this.run(
      connection,
      readOnlyQuery(query, connection.driver),
      signal,
    );
  }
}
