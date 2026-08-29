import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type { MachineDatabaseQueryResult } from '@dev-dashboard/contracts';

import {
  DatabaseExplorerAdapterError,
  type DatabaseCommandRunner,
} from './database-explorer-adapter.js';

const execFileAsync = promisify(execFile);
export const DATABASE_COMMAND_TIMEOUT_MS = 15_000;
const MAX_ROWS = 100;

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

export function parseDatabaseCliResult(
  output: string,
): MachineDatabaseQueryResult {
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

export async function runDatabaseCliCommand(options: {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  runner: DatabaseCommandRunner;
  signal?: AbortSignal;
}): Promise<MachineDatabaseQueryResult> {
  try {
    return parseDatabaseCliResult(
      await options.runner(
        options.command,
        options.args,
        options.env,
        options.signal,
      ),
    );
  } catch (error) {
    if (isAbortFailure(error, options.signal)) {
      throw new DatabaseExplorerAdapterError('aborted', 'Consulta cancelada.');
    }
    const code =
      error && typeof error === 'object' && 'code' in error
        ? String(error.code)
        : '';
    if (code === 'ENOENT') {
      throw new DatabaseExplorerAdapterError(
        'client-unavailable',
        `O cliente ${options.command} não está instalado nesta máquina.`,
      );
    }
    const failureText = commandFailureText(error);
    if (
      failureText.includes('access denied') ||
      failureText.includes('password authentication failed') ||
      (failureText.includes('role') && failureText.includes('does not exist'))
    ) {
      throw new DatabaseExplorerAdapterError(
        'credentials-rejected',
        'Credenciais rejeitadas. Informe um usuário e senha válidos para este banco.',
      );
    }
    if (
      failureText.includes('connection refused') ||
      failureText.includes("can't connect") ||
      failureText.includes('could not connect')
    ) {
      throw new DatabaseExplorerAdapterError(
        'connection-failed',
        'Não foi possível conectar ao serviço. Verifique se ele está em execução e se a porta está correta.',
      );
    }
    if (
      failureText.includes('unknown database') ||
      (failureText.includes('database') &&
        failureText.includes('does not exist'))
    ) {
      throw new DatabaseExplorerAdapterError(
        'database-unavailable',
        'O banco informado não existe ou o usuário não tem acesso a ele.',
      );
    }
    throw new DatabaseExplorerAdapterError(
      'command-failed',
      'Não foi possível consultar o banco. Informe as credenciais do banco e verifique o serviço selecionado.',
    );
  }
}
