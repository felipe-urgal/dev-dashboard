import assert from 'node:assert/strict';
import net from 'node:net';
import test from 'node:test';

import {
  parseResp,
  RedisExplorerAdapter,
  RespError,
  type RespValue,
} from '../src/services/redis-explorer-adapter.js';

function encode(value: RespValue): string {
  if (value === null) return '$-1\r\n';
  if (value instanceof RespError) return `-${value.message}\r\n`;
  if (typeof value === 'number') return `:${value}\r\n`;
  if (Array.isArray(value))
    return `*${value.length}\r\n${value.map(encode).join('')}`;
  return `$${Buffer.byteLength(value)}\r\n${value}\r\n`;
}

/** Servidor RESP mínimo: responde cada comando com o handler informado. */
async function fakeRedis(
  handler: (args: string[]) => RespValue,
): Promise<{ port: number; commands: string[][]; close: () => void }> {
  const commands: string[][] = [];
  const server = net.createServer((socket) => {
    let pending = Buffer.alloc(0);
    socket.on('data', (chunk) => {
      pending = Buffer.concat([pending, chunk]);
      for (;;) {
        const parsed = parseResp(pending);
        if (!parsed) break;
        pending = pending.subarray(parsed[1]);
        const args = (parsed[0] as RespValue[]).map(String);
        commands.push(args);
        socket.write(encode(handler(args)));
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as net.AddressInfo;
  return { port, commands, close: () => server.close() };
}

const connection = (port: number, extra = {}) => ({
  driver: 'redis' as const,
  host: '127.0.0.1',
  port,
  ...extra,
});

test('o console só executa comandos de leitura e nunca envia escrita ao servidor', async () => {
  const redis = await fakeRedis(() => 'valor');
  const adapter = new RedisExplorerAdapter();

  for (const command of [
    'SET chave valor',
    'DEL chave',
    'FLUSHALL',
    'CONFIG SET x y',
  ]) {
    await assert.rejects(
      adapter.query(connection(redis.port), command),
      (error: { reason?: string }) => error.reason === 'invalid-query',
    );
  }
  assert.deepEqual(redis.commands, []);

  const result = await adapter.query(
    connection(redis.port),
    'GET "minha chave"',
  );
  assert.deepEqual(result.rows, [['valor']]);
  assert.deepEqual(redis.commands, [['GET', 'minha chave']]);
  redis.close();
});

test('lista chaves por SCAN e lê hash e string na prévia', async () => {
  const redis = await fakeRedis((args) => {
    switch (args[0]) {
      case 'SCAN':
        return ['0', ['sessao:2', 'config', 'sessao:1']];
      case 'TYPE':
        return args[1] === 'config' ? 'hash' : 'string';
      case 'HGETALL':
        return ['tema', 'escuro', 'idioma', 'pt'];
      case 'GET':
        return 'ativa';
      default:
        return new RespError('ERR inesperado');
    }
  });
  const adapter = new RedisExplorerAdapter();

  const keys = await adapter.listTables(connection(redis.port));
  assert.deepEqual(
    keys.map((key) => key.name),
    ['config', 'sessao:1', 'sessao:2'],
  );

  const hash = await adapter.preview(
    connection(redis.port),
    undefined,
    'config',
  );
  assert.deepEqual(hash.columns, ['field', 'value']);
  assert.deepEqual(hash.rows, [
    ['tema', 'escuro'],
    ['idioma', 'pt'],
  ]);

  const text = await adapter.preview(
    connection(redis.port),
    undefined,
    'sessao:1',
  );
  assert.deepEqual(text.rows, [['string', 'ativa']]);
  redis.close();
});

test('senha rejeitada vira credentials-rejected e a senha só vai no AUTH', async () => {
  const redis = await fakeRedis((args) =>
    args[0] === 'AUTH'
      ? new RespError('WRONGPASS invalid username-password pair')
      : 'ok',
  );
  const adapter = new RedisExplorerAdapter();

  await assert.rejects(
    adapter.listDatabases(connection(redis.port, { password: 'errada' })),
    (error: { reason?: string; message: string }) =>
      error.reason === 'credentials-rejected' &&
      !error.message.includes('errada'),
  );
  assert.deepEqual(redis.commands, [['AUTH', 'errada']]);
  redis.close();
});
