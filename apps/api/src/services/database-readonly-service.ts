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
const MAX_QUERY_ROWS = 101;
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

function topLevelKeywordIndex(query: string, keyword: string): number {
  let depth = 0;
  let quote: "'" | '"' | '`' | undefined;
  const lower = query.toLowerCase();

  for (let index = 0; index < query.length; index += 1) {
    const current = query[index]!;
    if (quote) {
      if (current === quote) {
        if (query[index + 1] === quote) {
          index += 1;
        } else {
          quote = undefined;
        }
      } else if (current === '\\') {
        index += 1;
      }
      continue;
    }

    if (current === "'" || current === '"' || current === '`') {
      quote = current;
      continue;
    }
    if (current === '(') {
      depth += 1;
      continue;
    }
    if (current === ')') {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth !== 0 || !lower.startsWith(keyword, index)) continue;

    const before = index === 0 ? '' : query[index - 1]!;
    const after = query[index + keyword.length] ?? '';
    if (!/[A-Za-z0-9_$]/.test(before) && !/[A-Za-z0-9_$]/.test(after)) {
      return index;
    }
  }

  return -1;
}

function boundedReadOnlyQuery(
  query: string,
  driver: MachineDatabaseConnection['driver'],
): string {
  const normalized = readOnlyQuery(query, driver);
  if (topLevelKeywordIndex(normalized, 'fetch') >= 0) {
    throw new DatabaseExplorerAdapterError(
      'invalid-query',
      'Use LIMIT para limitar resultados no explorador.',
    );
  }

  const limitIndex = topLevelKeywordIndex(normalized, 'limit');
  if (limitIndex < 0) return `${normalized} LIMIT ${MAX_QUERY_ROWS}`;

  const prefixEnd = limitIndex + 'limit'.length;
  const suffix = normalized.slice(prefixEnd);
  const match = suffix.match(/^(\s+)(\d+)(\s*,\s*(\d+))?/);
  if (!match) {
    throw new DatabaseExplorerAdapterError(
      'invalid-query',
      'Use LIMIT com um valor numérico no explorador.',
    );
  }

  if (match[4]) {
    const count = Number(match[4]);
    if (count <= MAX_QUERY_ROWS) return normalized;
    const countOffset = prefixEnd + match[0].lastIndexOf(match[4]);
    return `${normalized.slice(0, countOffset)}${MAX_QUERY_ROWS}${normalized.slice(
      countOffset + match[4].length,
    )}`;
  }

  const count = Number(match[2]);
  if (count <= MAX_QUERY_ROWS) return normalized;
  const countOffset = prefixEnd + match[1].length;
  return `${normalized.slice(0, countOffset)}${MAX_QUERY_ROWS}${normalized.slice(
    countOffset + match[2].length,
  )}`;
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
      boundedReadOnlyQuery(query, connection.driver),
      signal,
    );
  }
}
