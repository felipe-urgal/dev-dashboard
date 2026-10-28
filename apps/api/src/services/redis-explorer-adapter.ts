import net from 'node:net';

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
import {
  DATABASE_MAX_ROWS,
  mapDatabaseDriverError,
  runAbortableDatabaseOperation,
  toDatabaseQueryResult,
} from './database-explorer-driver.js';

const MAX_REPLY_BYTES = 4 * 1024 * 1024;
const MAX_KEYS = 1_000;
const MAX_KEY_LENGTH = 128;

/** Comandos de leitura permitidos no console; qualquer outro é recusado. */
const READ_ONLY_COMMANDS = new Set([
  'GET',
  'MGET',
  'STRLEN',
  'TYPE',
  'TTL',
  'PTTL',
  'EXISTS',
  'HGET',
  'HMGET',
  'HGETALL',
  'HKEYS',
  'HVALS',
  'HLEN',
  'LRANGE',
  'LLEN',
  'LINDEX',
  'SMEMBERS',
  'SCARD',
  'SISMEMBER',
  'ZRANGE',
  'ZCARD',
  'ZSCORE',
  'ZRANK',
  'XLEN',
  'XRANGE',
  'SCAN',
  'SSCAN',
  'HSCAN',
  'ZSCAN',
  'DBSIZE',
  'INFO',
  'PING',
]);

export class RespError {
  public constructor(public readonly message: string) {}
}

export type RespValue = string | number | null | RespError | RespValue[];

/** Decodifica uma resposta RESP2; devolve null enquanto ela estiver incompleta. */
export function parseResp(
  buffer: Buffer,
  offset = 0,
): [RespValue, number] | null {
  if (offset >= buffer.length) return null;
  const type = String.fromCharCode(buffer[offset]!);
  const lineEnd = buffer.indexOf('\r\n', offset);
  if (lineEnd === -1) return null;
  const line = buffer.toString('utf8', offset + 1, lineEnd);
  const next = lineEnd + 2;

  switch (type) {
    case '+':
      return [line, next];
    case '-':
      return [new RespError(line), next];
    case ':':
      return [Number(line), next];
    case '$': {
      const length = Number(line);
      if (length < 0) return [null, next];
      if (buffer.length < next + length + 2) return null;
      return [buffer.toString('utf8', next, next + length), next + length + 2];
    }
    case '*': {
      const count = Number(line);
      if (count < 0) return [null, next];
      const items: RespValue[] = [];
      let position = next;
      for (let index = 0; index < count; index += 1) {
        const item = parseResp(buffer, position);
        if (!item) return null;
        items.push(item[0]);
        position = item[1];
      }
      return [items, position];
    }
    default:
      throw new DatabaseExplorerAdapterError(
        'command-failed',
        'Resposta inválida do Redis.',
      );
  }
}

function encodeCommand(args: string[]): Buffer {
  const parts = [`*${args.length}\r\n`];
  for (const arg of args) {
    parts.push(`$${Buffer.byteLength(arg)}\r\n${arg}\r\n`);
  }
  return Buffer.from(parts.join(''));
}

export interface RedisExplorerClient {
  send(args: string[]): Promise<RespValue>;
  close(): void;
}

export type RedisClientFactory = (
  host: string,
  port: number,
) => Promise<RedisExplorerClient>;

const defaultRedisClientFactory: RedisClientFactory = (host, port) =>
  new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    let received = Buffer.alloc(0);
    const pending: Array<{
      resolve: (value: RespValue) => void;
      reject: (error: unknown) => void;
    }> = [];

    const failAll = (error: unknown) => {
      for (const waiter of pending.splice(0)) waiter.reject(error);
    };

    socket.on('data', (chunk) => {
      received = Buffer.concat([received, Buffer.from(chunk)]);
      if (received.length > MAX_REPLY_BYTES) {
        socket.destroy();
        failAll(
          new DatabaseExplorerAdapterError(
            'command-failed',
            'O resultado excedeu o limite de 2 MiB.',
          ),
        );
        return;
      }
      try {
        for (;;) {
          const reply = parseResp(received);
          if (!reply) break;
          received = received.subarray(reply[1]);
          pending.shift()?.resolve(reply[0]);
        }
      } catch (error) {
        socket.destroy();
        failAll(error);
      }
    });
    socket.on('error', (error) => {
      failAll(error);
      reject(error);
    });
    socket.on('close', () =>
      failAll(
        new DatabaseExplorerAdapterError(
          'connection-failed',
          'A conexão com o Redis foi encerrada.',
        ),
      ),
    );
    socket.once('connect', () =>
      resolve({
        send: (args) =>
          new Promise((resolveReply, rejectReply) => {
            pending.push({ resolve: resolveReply, reject: rejectReply });
            socket.write(encodeCommand(args));
          }),
        close: () => socket.destroy(),
      }),
    );
  });

/** Separa uma linha de comando respeitando aspas simples e duplas. */
export function tokenizeRedisCommand(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | undefined;
  let started = false;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]!;
    if (quote) {
      if (char === '\\' && index + 1 < input.length) {
        index += 1;
        current += input[index];
      } else if (char === quote) quote = undefined;
      else current += char;
    } else if (char === '"' || char === "'") {
      quote = char;
      started = true;
    } else if (/\s/.test(char)) {
      if (started || current) tokens.push(current);
      current = '';
      started = false;
    } else {
      current += char;
    }
  }
  if (quote) {
    throw new DatabaseExplorerAdapterError(
      'invalid-query',
      'Aspas não fechadas no comando.',
    );
  }
  if (started || current) tokens.push(current);
  return tokens;
}

function text(value: RespValue): string {
  if (value === null) return 'NULL';
  if (value instanceof RespError) return value.message;
  if (Array.isArray(value)) return JSON.stringify(value.map(plain));
  return String(value);
}

function plain(value: RespValue): unknown {
  if (value instanceof RespError) return value.message;
  if (Array.isArray(value)) return value.map(plain);
  return value;
}

function pairs(values: RespValue): Array<[string, string]> {
  const list = Array.isArray(values) ? values : [];
  const result: Array<[string, string]> = [];
  for (let index = 0; index + 1 < list.length; index += 2) {
    result.push([text(list[index]!), text(list[index + 1]!)]);
  }
  return result;
}

function databaseIndex(connection: MachineDatabaseConnection): number {
  const name = connection.database?.trim();
  if (!name) return 0;
  const match = /^db(\d{1,3})$/.exec(name);
  if (!match) {
    throw new DatabaseExplorerAdapterError(
      'invalid-query',
      'Banco Redis inválido. Use db0, db1…',
    );
  }
  return Number(match[1]);
}

export class RedisExplorerAdapter implements DatabaseExplorerAdapter {
  public constructor(
    private readonly clientFactory: RedisClientFactory = defaultRedisClientFactory,
  ) {}

  private async withClient<T>(
    connection: MachineDatabaseConnection,
    signal: AbortSignal | undefined,
    operation: (send: (args: string[]) => Promise<RespValue>) => Promise<T>,
  ): Promise<T> {
    if (signal?.aborted) {
      throw new DatabaseExplorerAdapterError('aborted', 'Consulta cancelada.');
    }
    const host = connection.host?.trim() || '127.0.0.1';
    const port = connection.port ?? 6379;
    const database = databaseIndex(connection);
    let client: RedisExplorerClient | undefined;

    const send = async (args: string[]): Promise<RespValue> => {
      const reply = await client!.send(args);
      if (reply instanceof RespError) {
        if (/WRONGPASS|NOAUTH|invalid password|AUTH/i.test(reply.message)) {
          throw new DatabaseExplorerAdapterError(
            'credentials-rejected',
            'Credenciais rejeitadas. Informe um usuário e senha válidos para este Redis.',
          );
        }
        throw new DatabaseExplorerAdapterError(
          'command-failed',
          `O Redis recusou o comando: ${reply.message.slice(0, 160)}`,
        );
      }
      return reply;
    };

    try {
      return await runAbortableDatabaseOperation({
        ...(signal ? { signal } : {}),
        terminate: () => client?.close(),
        operation: (async () => {
          client = await this.clientFactory(host, port);
          if (connection.password) {
            await send(
              connection.username
                ? ['AUTH', connection.username, connection.password]
                : ['AUTH', connection.password],
            );
          }
          if (database > 0) await send(['SELECT', String(database)]);
          return operation(send);
        })(),
      });
    } catch (error) {
      throw mapDatabaseDriverError(error, signal);
    } finally {
      client?.close();
    }
  }

  async listDatabases(
    connection: MachineDatabaseConnection,
    signal?: AbortSignal,
  ): Promise<MachineDatabaseCatalogItem[]> {
    return this.withClient(connection, signal, async (send) => {
      const info = text(await send(['INFO', 'keyspace']));
      const names = new Set<number>([0]);
      for (const match of info.matchAll(/^db(\d+):/gm)) {
        names.add(Number(match[1]));
      }
      return [...names].sort((a, b) => a - b).map((n) => ({ name: `db${n}` }));
    });
  }

  async listTables(
    connection: MachineDatabaseConnection,
    signal?: AbortSignal,
  ): Promise<MachineDatabaseTable[]> {
    return this.withClient(connection, signal, async (send) => {
      const keys: string[] = [];
      let cursor = '0';
      do {
        const reply = await send(['SCAN', cursor, 'COUNT', '500']);
        const [next, batch] = Array.isArray(reply) ? reply : ['0', []];
        cursor = text(next ?? '0');
        for (const key of Array.isArray(batch) ? batch : []) {
          const name = text(key);
          if (name.length <= MAX_KEY_LENGTH) keys.push(name);
        }
      } while (cursor !== '0' && keys.length < MAX_KEYS);
      return keys
        .slice(0, MAX_KEYS)
        .sort((a, b) => a.localeCompare(b))
        .map((name) => ({ name }));
    });
  }

  async preview(
    connection: MachineDatabaseConnection,
    _schema: string | undefined,
    table: string,
    signal?: AbortSignal,
  ): Promise<MachineDatabaseQueryResult> {
    return this.withClient(connection, signal, async (send) => {
      const limit = String(DATABASE_MAX_ROWS - 1);
      const type = text(await send(['TYPE', table]));
      switch (type) {
        case 'string':
          return toDatabaseQueryResult(
            ['type', 'value'],
            [[type, plain(await send(['GET', table]))]],
          );
        case 'hash':
          return toDatabaseQueryResult(
            ['field', 'value'],
            pairs(await send(['HGETALL', table])),
          );
        case 'list': {
          const items = await send(['LRANGE', table, '0', limit]);
          return toDatabaseQueryResult(
            ['index', 'value'],
            (Array.isArray(items) ? items : []).map((item, index) => [
              index,
              text(item),
            ]),
          );
        }
        case 'set': {
          const reply = await send(['SSCAN', table, '0', 'COUNT', '100']);
          const members = Array.isArray(reply) ? reply[1] : [];
          return toDatabaseQueryResult(
            ['member'],
            (Array.isArray(members) ? members : []).map((m) => [text(m)]),
          );
        }
        case 'zset':
          return toDatabaseQueryResult(
            ['member', 'score'],
            pairs(await send(['ZRANGE', table, '0', limit, 'WITHSCORES'])),
          );
        case 'stream': {
          const entries = await send([
            'XRANGE',
            table,
            '-',
            '+',
            'COUNT',
            String(DATABASE_MAX_ROWS),
          ]);
          return toDatabaseQueryResult(
            ['id', 'fields'],
            (Array.isArray(entries) ? entries : []).map((entry) => {
              const [id, fields] = Array.isArray(entry) ? entry : ['', []];
              return [text(id ?? ''), text(fields ?? [])];
            }),
          );
        }
        default:
          throw new DatabaseExplorerAdapterError(
            'invalid-query',
            'A chave não existe ou o tipo não é suportado.',
          );
      }
    });
  }

  async query(
    connection: MachineDatabaseConnection,
    query: string,
    signal?: AbortSignal,
  ): Promise<MachineDatabaseQueryResult> {
    const args = tokenizeRedisCommand(query);
    const command = args[0]?.toUpperCase();
    if (!command) {
      throw new DatabaseExplorerAdapterError(
        'invalid-query',
        'Informe um comando Redis de leitura.',
      );
    }
    if (!READ_ONLY_COMMANDS.has(command)) {
      throw new DatabaseExplorerAdapterError(
        'invalid-query',
        `O comando ${command} não é permitido no modo somente leitura.`,
      );
    }
    return this.withClient(connection, signal, async (send) => {
      const reply = await send([command, ...args.slice(1)]);
      const rows: unknown[][] = Array.isArray(reply)
        ? reply.map((item) => [text(item)])
        : typeof reply === 'string' && reply.includes('\n')
          ? reply
              .split(/\r?\n/)
              .filter(Boolean)
              .map((line) => [line])
          : [[plainOrNull(reply)]];
      return toDatabaseQueryResult(['resultado'], rows);
    });
  }
}

function plainOrNull(value: RespValue): unknown {
  return value === null ? null : plain(value);
}
