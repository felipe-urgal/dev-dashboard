import type { MachineDatabaseQueryResult } from '@dev-dashboard/contracts';

import { DatabaseExplorerAdapterError } from './database-explorer-adapter.js';

export const DATABASE_QUERY_TIMEOUT_MS = 15_000;
export const DATABASE_MAX_ROWS = 100;
export const DATABASE_MAX_RESULT_BYTES = 2 * 1024 * 1024;

function normalizeDatabaseValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number' && !Number.isFinite(value))
    return String(value);
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return `0x${value.toString('hex')}`;
  if (value instanceof Uint8Array) {
    return `0x${Buffer.from(value).toString('hex')}`;
  }
  if (Array.isArray(value)) return value.map(normalizeDatabaseValue);
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        normalizeDatabaseValue(nested),
      ]),
    );
  }
  return String(value);
}

export function toDatabaseQueryResult(
  columns: string[],
  rows: unknown[][],
): MachineDatabaseQueryResult {
  const rowCount = rows.length;
  const result: MachineDatabaseQueryResult = {
    columns,
    rows: rows
      .slice(0, DATABASE_MAX_ROWS)
      .map((row) => row.map(normalizeDatabaseValue)),
    rowCount,
    truncated: rowCount > DATABASE_MAX_ROWS,
  };
  if (
    Buffer.byteLength(JSON.stringify(result), 'utf8') >
    DATABASE_MAX_RESULT_BYTES
  ) {
    throw new DatabaseExplorerAdapterError(
      'command-failed',
      'O resultado excedeu o limite de 2 MiB.',
    );
  }
  return result;
}

function errorDetails(error: unknown): {
  code: string;
  message: string;
  name: string;
} {
  if (!error || typeof error !== 'object') {
    return { code: '', message: '', name: '' };
  }
  const failure = error as {
    code?: unknown;
    errno?: unknown;
    message?: unknown;
    name?: unknown;
  };
  const codeValue = failure.code ?? failure.errno;
  return {
    code:
      typeof codeValue === 'string' || typeof codeValue === 'number'
        ? String(codeValue).toUpperCase()
        : '',
    message:
      typeof failure.message === 'string' ? failure.message.toLowerCase() : '',
    name: typeof failure.name === 'string' ? failure.name : '',
  };
}

export function mapDatabaseDriverError(
  error: unknown,
  signal?: AbortSignal,
): DatabaseExplorerAdapterError {
  if (error instanceof DatabaseExplorerAdapterError) return error;

  const details = errorDetails(error);
  if (
    signal?.aborted ||
    details.name === 'AbortError' ||
    details.code === 'ABORT_ERR'
  ) {
    return new DatabaseExplorerAdapterError('aborted', 'Consulta cancelada.');
  }

  if (
    ['28P01', '28000', 'ER_ACCESS_DENIED_ERROR', '1045'].includes(
      details.code,
    ) ||
    details.message.includes('access denied') ||
    details.message.includes('password authentication failed')
  ) {
    return new DatabaseExplorerAdapterError(
      'credentials-rejected',
      'Credenciais rejeitadas. Informe um usuário e senha válidos para este banco.',
    );
  }

  if (
    ['3D000', 'ER_BAD_DB_ERROR', '1049'].includes(details.code) ||
    details.message.includes('unknown database') ||
    (details.message.includes('database') &&
      details.message.includes('does not exist'))
  ) {
    return new DatabaseExplorerAdapterError(
      'database-unavailable',
      'O banco informado não existe ou o usuário não tem acesso a ele.',
    );
  }

  if (
    details.code.startsWith('08') ||
    [
      'ECONNREFUSED',
      'ECONNRESET',
      'EHOSTUNREACH',
      'ENETUNREACH',
      'ENOTFOUND',
      'ETIMEDOUT',
      '57P03',
    ].includes(details.code) ||
    details.message.includes('connection refused') ||
    details.message.includes("can't connect") ||
    details.message.includes('could not connect')
  ) {
    return new DatabaseExplorerAdapterError(
      'connection-failed',
      'Não foi possível conectar ao serviço. Verifique se ele está em execução e se a porta está correta.',
    );
  }

  return new DatabaseExplorerAdapterError(
    'command-failed',
    'Não foi possível consultar o banco. Informe as credenciais do banco e verifique o serviço selecionado.',
  );
}

export async function runAbortableDatabaseOperation<T>(options: {
  operation: Promise<T>;
  signal?: AbortSignal;
  terminate: () => void;
}): Promise<T> {
  const { operation, signal, terminate } = options;
  if (signal?.aborted) {
    terminate();
    throw new DatabaseExplorerAdapterError('aborted', 'Consulta cancelada.');
  }

  let timeout: NodeJS.Timeout | undefined;
  let abortHandler: (() => void) | undefined;
  const interruption = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      terminate();
      reject(
        new DatabaseExplorerAdapterError(
          'command-failed',
          'A consulta excedeu o limite de 15 segundos.',
        ),
      );
    }, DATABASE_QUERY_TIMEOUT_MS);

    if (signal) {
      abortHandler = () => {
        terminate();
        reject(
          new DatabaseExplorerAdapterError('aborted', 'Consulta cancelada.'),
        );
      };
      signal.addEventListener('abort', abortHandler, { once: true });
    }
  });

  try {
    return await Promise.race([operation, interruption]);
  } finally {
    if (timeout) clearTimeout(timeout);
    if (signal && abortHandler)
      signal.removeEventListener('abort', abortHandler);
  }
}
