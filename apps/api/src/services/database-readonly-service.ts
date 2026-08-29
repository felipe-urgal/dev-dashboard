import type {
  MachineDatabaseCatalogItem,
  MachineDatabaseConnection,
  MachineDatabaseQueryResult,
  MachineDatabaseTable,
} from '@dev-dashboard/contracts';

import {
  DatabaseExplorerAdapterError,
  type DatabaseExplorerAdapter,
} from './database-explorer-adapter.js';
import { MysqlExplorerAdapter } from './mysql-explorer-adapter.js';
import { PostgresExplorerAdapter } from './postgres-explorer-adapter.js';

export { DatabaseExplorerAdapterError as DatabaseReadonlyError };

const MAX_QUERY_LENGTH = 4_000;
const localHosts = new Set(['localhost', '127.0.0.1', '::1']);

const blockedPostgresFunctions =
  /\b(?:nextval|setval|pg_sleep|pg_notify|pg_advisory_(?:xact_)?lock(?:_shared)?|pg_cancel_backend|pg_terminate_backend|pg_reload_conf|pg_rotate_logfile|pg_create_restore_point|lo_import|lo_export|dblink_exec)\s*\(/i;
const blockedMysqlFunctions =
  /\b(?:get_lock|release_lock|load_file|sleep|benchmark)\s*\(/i;

export interface DatabaseReadonlyServiceOptions {
  postgresAdapter?: DatabaseExplorerAdapter;
  mysqlAdapter?: DatabaseExplorerAdapter;
}

function validateConnection(connection: MachineDatabaseConnection): void {
  if (!['mysql', 'mariadb', 'postgresql'].includes(connection.driver)) {
    throw new DatabaseExplorerAdapterError(
      'unsupported-driver',
      'Este explorador suporta somente MySQL, MariaDB e PostgreSQL.',
    );
  }
  const host = connection.host?.trim() || '127.0.0.1';
  if (!localHosts.has(host)) {
    throw new DatabaseExplorerAdapterError(
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
    throw new DatabaseExplorerAdapterError(
      'invalid-connection',
      'A porta informada é inválida.',
    );
  }
}

function rejectUnsafeReadConstructs(
  query: string,
  driver: MachineDatabaseConnection['driver'],
): void {
  if (/\bfor\s+(?:no\s+key\s+update|key\s+share|update|share)\b/i.test(query)) {
    throw new DatabaseExplorerAdapterError(
      'invalid-query',
      'Consultas com bloqueio explícito de linhas não são permitidas.',
    );
  }

  if (driver === 'postgresql') {
    if (/\binto\b/i.test(query) || blockedPostgresFunctions.test(query)) {
      throw new DatabaseExplorerAdapterError(
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
    throw new DatabaseExplorerAdapterError(
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
    throw new DatabaseExplorerAdapterError(
      'invalid-query',
      'Informe uma consulta de até 4.000 caracteres.',
    );
  }
  if (!/^(select|with)\b/i.test(normalized) || /;|--|\/\*/.test(normalized)) {
    throw new DatabaseExplorerAdapterError(
      'invalid-query',
      'Somente uma consulta SELECT/WITH, sem comandos múltiplos, é permitida.',
    );
  }
  if (
    /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|replace|call|execute|copy)\b/i.test(
      normalized,
    )
  ) {
    throw new DatabaseExplorerAdapterError(
      'invalid-query',
      'A consulta contém uma operação de escrita ou administração bloqueada.',
    );
  }
  rejectUnsafeReadConstructs(normalized, driver);
  return normalized;
}

export class DatabaseReadonlyService {
  private readonly postgresAdapter: DatabaseExplorerAdapter;
  private readonly mysqlAdapter: DatabaseExplorerAdapter;

  public constructor(options: DatabaseReadonlyServiceOptions = {}) {
    this.postgresAdapter = options.postgresAdapter ?? new PostgresExplorerAdapter();
    this.mysqlAdapter = options.mysqlAdapter ?? new MysqlExplorerAdapter();
  }

  private adapterFor(
    connection: MachineDatabaseConnection,
  ): DatabaseExplorerAdapter {
    validateConnection(connection);
    return connection.driver === 'postgresql'
      ? this.postgresAdapter
      : this.mysqlAdapter;
  }

  async listDatabases(
    connection: MachineDatabaseConnection,
    signal?: AbortSignal,
  ): Promise<MachineDatabaseCatalogItem[]> {
    return this.adapterFor(connection).listDatabases(connection, signal);
  }

  async listTables(
    connection: MachineDatabaseConnection,
    signal?: AbortSignal,
  ): Promise<MachineDatabaseTable[]> {
    return this.adapterFor(connection).listTables(connection, signal);
  }

  async preview(
    connection: MachineDatabaseConnection,
    schema: string | undefined,
    table: string,
    signal?: AbortSignal,
  ): Promise<MachineDatabaseQueryResult> {
    return this.adapterFor(connection).preview(
      connection,
      schema,
      table,
      signal,
    );
  }

  async query(
    connection: MachineDatabaseConnection,
    query: string,
    signal?: AbortSignal,
  ): Promise<MachineDatabaseQueryResult> {
    return this.adapterFor(connection).query(
      connection,
      readOnlyQuery(query, connection.driver),
      signal,
    );
  }
}
