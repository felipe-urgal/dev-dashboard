import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type {
  MachineDatabaseConnection,
  MachineDatabaseQueryResult,
} from '@dev-dashboard/contracts';

import { DatabaseReadonlyError } from './database-readonly-error.js';

const execFileAsync = promisify(execFile);
export const DATABASE_COMMAND_TIMEOUT_MS = 15_000;
export const DATABASE_MAX_ROWS = 100;
const POSTGRES_READ_ONLY_OPTIONS = `-c default_transaction_read_only=on -c statement_timeout=${DATABASE_COMMAND_TIMEOUT_MS}`;
const MYSQL_READ_ONLY_INIT_COMMAND = 'SET SESSION TRANSACTION READ ONLY';

export type DatabaseCommandRunner = (
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  signal?: AbortSignal,
) => Promise<string>;

export interface DatabaseReadonlyAdapter {
  execute(
    connection: MachineDatabaseConnection,
    sql: string,
    signal?: AbortSignal,
  ): Promise<MachineDatabaseQueryResult>;
}

export const defaultDatabaseCommandRunner: DatabaseCommandRunner = async (
  command,
  args,
  env,
  signal,
) => {
  const result = await execFileAsync(command, args, {
    env,
    encoding: 'utf8',
    maxBuffer: 2 * 1024 * 1024,
    timeout: DATABASE_COMMAND_TIMEOUT_MS,
    windowsHide: true,
    signal,
  });
  return result.stdout;
};

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

function isAbortFailure(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  if (!error || typeof error !== 'object') return false;
  const failure = error as { code?: unknown; name?: unknown };
  return failure.name === 'AbortError' || failure.code === 'ABORT_ERR';
}

function parseTabular(output: string): MachineDatabaseQueryResult {
  const lines = output.replace(/\r/g, '').split('\n').filter(Boolean);
  if (!lines.length)
    return { columns: [], rows: [], rowCount: 0, truncated: false };
  const split = (line: string) =>
    line.split('\t').map((value) => (value === '\\N' ? null : value));
  const columns = split(lines[0]!).map(String);
  const rows = lines.slice(1, DATABASE_MAX_ROWS + 1).map(split);
  return {
    columns,
    rows,
    rowCount: lines.length - 1,
    truncated: lines.length - 1 > DATABASE_MAX_ROWS,
  };
}

abstract class CliDatabaseReadonlyAdapter implements DatabaseReadonlyAdapter {
  protected abstract readonly command: 'psql' | 'mysql';

  public constructor(
    protected readonly commandRunner: DatabaseCommandRunner = defaultDatabaseCommandRunner,
  ) {}

  protected abstract buildInvocation(
    connection: MachineDatabaseConnection,
    sql: string,
  ): {
    args: string[];
    env: NodeJS.ProcessEnv;
  };

  async execute(
    connection: MachineDatabaseConnection,
    sql: string,
    signal?: AbortSignal,
  ): Promise<MachineDatabaseQueryResult> {
    const { args, env } = this.buildInvocation(connection, sql);
    try {
      return parseTabular(
        await this.commandRunner(this.command, args, env, signal),
      );
    } catch (error) {
      if (isAbortFailure(error, signal)) {
        throw new DatabaseReadonlyError('aborted', 'Consulta cancelada.');
      }
      const code =
        error && typeof error === 'object' && 'code' in error
          ? String(error.code)
          : '';
      if (code === 'ENOENT') {
        throw new DatabaseReadonlyError(
          'client-unavailable',
          `O cliente ${this.command} não está instalado nesta máquina.`,
        );
      }
      const failureText = commandFailureText(error);
      if (
        failureText.includes('access denied') ||
        failureText.includes('password authentication failed') ||
        (failureText.includes('role') && failureText.includes('does not exist'))
      ) {
        throw new DatabaseReadonlyError(
          'credentials-rejected',
          'Credenciais rejeitadas. Informe um usuário e senha válidos para este banco.',
        );
      }
      if (
        failureText.includes('connection refused') ||
        failureText.includes("can't connect") ||
        failureText.includes('could not connect')
      ) {
        throw new DatabaseReadonlyError(
          'connection-failed',
          'Não foi possível conectar ao serviço. Verifique se ele está em execução e se a porta está correta.',
        );
      }
      if (
        failureText.includes('unknown database') ||
        (failureText.includes('database') && failureText.includes('does not exist'))
      ) {
        throw new DatabaseReadonlyError(
          'database-unavailable',
          'O banco informado não existe ou o usuário não tem acesso a ele.',
        );
      }
      throw new DatabaseReadonlyError(
        'command-failed',
        'Não foi possível consultar o banco. Informe as credenciais do banco e verifique o serviço selecionado.',
      );
    }
  }
}

export class PostgresCliDatabaseReadonlyAdapter extends CliDatabaseReadonlyAdapter {
  protected readonly command = 'psql' as const;

  protected buildInvocation(
    connection: MachineDatabaseConnection,
    sql: string,
  ): { args: string[]; env: NodeJS.ProcessEnv } {
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
    return {
      env,
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
    };
  }
}

export class MysqlCliDatabaseReadonlyAdapter extends CliDatabaseReadonlyAdapter {
  protected readonly command = 'mysql' as const;

  protected buildInvocation(
    connection: MachineDatabaseConnection,
    sql: string,
  ): { args: string[]; env: NodeJS.ProcessEnv } {
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
    return {
      env,
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
    };
  }
}

export function createDatabaseReadonlyAdapters(
  commandRunner: DatabaseCommandRunner = defaultDatabaseCommandRunner,
): Record<'postgresql' | 'mysql' | 'mariadb', DatabaseReadonlyAdapter> {
  const mysqlAdapter = new MysqlCliDatabaseReadonlyAdapter(commandRunner);
  return {
    postgresql: new PostgresCliDatabaseReadonlyAdapter(commandRunner),
    mysql: mysqlAdapter,
    mariadb: mysqlAdapter,
  };
}
