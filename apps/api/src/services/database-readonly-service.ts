import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type {
  MachineDatabaseCatalogItem,
  MachineDatabaseConnection,
  MachineDatabaseQueryResult,
  MachineDatabaseTable,
} from '@dev-dashboard/contracts';

const execFileAsync = promisify(execFile);
const MAX_QUERY_LENGTH = 4_000;
const MAX_ROWS = 100;
const COMMAND_TIMEOUT_MS = 15_000;
const POSTGRES_READ_ONLY_OPTIONS =
  `-c default_transaction_read_only=on -c statement_timeout=${COMMAND_TIMEOUT_MS}`;
const MYSQL_READ_ONLY_INIT_COMMAND = 'SET SESSION TRANSACTION READ ONLY';
const localHosts = new Set(['localhost', '127.0.0.1', '::1']);

const blockedPostgresFunctions =
  /\b(?:nextval|setval|pg_sleep|pg_notify|pg_advisory_(?:xact_)?lock(?:_shared)?|pg_cancel_backend|pg_terminate_backend|pg_reload_conf|pg_rotate_logfile|pg_create_restore_point|lo_import|lo_export|dblink_exec)\s*\(/i;
const blockedMysqlFunctions =
  /\b(?:get_lock|release_lock|load_file|sleep|benchmark)\s*\(/i;

function commandFailureText(error: unknown): string {
  if (!error || typeof error !== 'object') return '';
  const failure = error as {
    code?: unknown;
    message?: unknown;
    stderr?: unknown;
    stdout?: unknown;
  };
  return [failure.code, failure.message, failure.stderr, failure.stdout]
    .filter(
      (value): value is string | number =>
        typeof value === 'string' || typeof value === 'number',
    )
    .join(' ')
    .toLowerCase();
}

type CommandRunner = (
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
) => Promise<string>;

const defaultCommandRunner: CommandRunner = async (command, args, env) => {
  const result = await execFileAsync(command, args, {
    env,
    encoding: 'utf8',
    maxBuffer: 2 * 1024 * 1024,
    timeout: COMMAND_TIMEOUT_MS,
    windowsHide: true,
  });
  return result.stdout;
};

export class DatabaseReadonlyError extends Error {
  public constructor(
    public readonly reason:
      | 'unsupported-driver'
      | 'remote-host'
      | 'invalid-query'
      | 'client-unavailable'
      | 'command-failed',
    message: string,
  ) {
    super(message);
    this.name = 'DatabaseReadonlyError';
  }
}

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
      'command-failed',
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
  if (
    /\bfor\s+(?:no\s+key\s+update|key\s+share|update|share)\b/i.test(query)
  ) {
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

function parseTabular(output: string): MachineDatabaseQueryResult {
  const lines = output.replace(/\r/g, '').split('\n').filter(Boolean);
  if (!lines.length)
    return { columns: [], rows: [], rowCount: 0, truncated: false };
  const split = (line: string) =>
    line.split('\t').map((value) => (value === '\\N' ? null : value));
  const columns = split(lines[0]!).map(String);
  const rows = lines.slice(1, MAX_ROWS + 1).map(split);
  return {
    columns,
    rows,
    rowCount: lines.length - 1,
    truncated: lines.length - 1 > MAX_ROWS,
  };
}

export class DatabaseReadonlyService {
  public constructor(
    private readonly commandRunner: CommandRunner = defaultCommandRunner,
  ) {}

  private async run(
    connection: MachineDatabaseConnection,
    sql: string,
  ): Promise<MachineDatabaseQueryResult> {
    validateConnection(connection);
    const host = connection.host?.trim() || '127.0.0.1';
    const port =
      connection.port ?? (connection.driver === 'postgresql' ? 5432 : 3306);
    const env = { ...process.env };
    const database =
      connection.database?.trim() ||
      (connection.driver === 'postgresql' ? 'postgres' : undefined);
    if (connection.driver === 'postgresql') {
      Object.assign(env, {
        PGHOST: host,
        PGPORT: String(port),
        PGOPTIONS: POSTGRES_READ_ONLY_OPTIONS,
        ...(connection.username ? { PGUSER: connection.username } : {}),
        ...(connection.password ? { PGPASSWORD: connection.password } : {}),
        ...(database ? { PGDATABASE: database } : {}),
      });
    } else {
      Object.assign(env, {
        MYSQL_HOST: host,
        MYSQL_TCP_PORT: String(port),
        ...(connection.username ? { MYSQL_USER: connection.username } : {}),
        ...(connection.password ? { MYSQL_PWD: connection.password } : {}),
        ...(database ? { MYSQL_DATABASE: database } : {}),
      });
    }
    const command = connection.driver === 'postgresql' ? 'psql' : 'mysql';
    const args =
      connection.driver === 'postgresql'
        ? [
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
          ]
        : [
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
          ];
    try {
      return parseTabular(await this.commandRunner(command, args, env));
    } catch (error) {
      const code =
        error && typeof error === 'object' && 'code' in error
          ? String(error.code)
          : '';
      if (code === 'ENOENT')
        throw new DatabaseReadonlyError(
          'client-unavailable',
          `O cliente ${command} não está instalado nesta máquina.`,
        );
      const failureText = commandFailureText(error);
      if (
        failureText.includes('access denied') ||
        failureText.includes('password authentication failed') ||
        (failureText.includes('role') && failureText.includes('does not exist'))
      ) {
        throw new DatabaseReadonlyError(
          'command-failed',
          'Credenciais rejeitadas. Informe um usuário e senha válidos para este banco.',
        );
      }
      if (
        failureText.includes('connection refused') ||
        failureText.includes("can't connect") ||
        failureText.includes('could not connect')
      ) {
        throw new DatabaseReadonlyError(
          'command-failed',
          'Não foi possível conectar ao serviço. Verifique se ele está em execução e se a porta está correta.',
        );
      }
      if (
        failureText.includes('unknown database') ||
        (failureText.includes('database') &&
          failureText.includes('does not exist'))
      ) {
        throw new DatabaseReadonlyError(
          'command-failed',
          'O banco informado não existe ou o usuário não tem acesso a ele.',
        );
      }
      throw new DatabaseReadonlyError(
        'command-failed',
        'Não foi possível consultar o banco. Informe as credenciais do banco e verifique o serviço selecionado.',
      );
    }
  }

  async listDatabases(
    connection: MachineDatabaseConnection,
  ): Promise<MachineDatabaseCatalogItem[]> {
    const sql =
      connection.driver === 'postgresql'
        ? 'SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname'
        : 'SELECT schema_name FROM information_schema.schemata ORDER BY schema_name';
    const result = await this.run(connection, sql);
    return result.rows
      .map((row) => ({ name: String(row[0] ?? '') }))
      .filter((item) => item.name);
  }

  async listTables(
    connection: MachineDatabaseConnection,
  ): Promise<MachineDatabaseTable[]> {
    const sql =
      connection.driver === 'postgresql'
        ? "SELECT table_schema, table_name FROM information_schema.tables WHERE table_type = 'BASE TABLE' AND table_schema NOT IN ('pg_catalog', 'information_schema') ORDER BY table_schema, table_name"
        : "SELECT table_schema, table_name FROM information_schema.tables WHERE table_type = 'BASE TABLE' ORDER BY table_schema, table_name";
    const result = await this.run(connection, sql);
    return result.rows.map((row) => ({
      schema: String(row[0] ?? ''),
      name: String(row[1] ?? ''),
    }));
  }

  async preview(
    connection: MachineDatabaseConnection,
    schema: string | undefined,
    table: string,
  ): Promise<MachineDatabaseQueryResult> {
    const target = schema
      ? `${quoteIdentifier(schema, connection.driver)}.${quoteIdentifier(table, connection.driver)}`
      : quoteIdentifier(table, connection.driver);
    return this.run(
      connection,
      `SELECT * FROM ${target} LIMIT ${MAX_ROWS + 1}`,
    );
  }

  async query(
    connection: MachineDatabaseConnection,
    query: string,
  ): Promise<MachineDatabaseQueryResult> {
    return this.run(connection, readOnlyQuery(query, connection.driver));
  }
}
