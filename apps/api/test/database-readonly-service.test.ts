import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DatabaseReadonlyError,
  DatabaseReadonlyService,
} from '../src/services/database-readonly-service.js';

test('lista bancos e tabelas sem expor a senha nos argumentos', async () => {
  const calls: Array<{
    command: string;
    args: string[];
    env: NodeJS.ProcessEnv;
  }> = [];
  const service = new DatabaseReadonlyService(async (command, args, env) => {
    calls.push({ command, args, env });
    return 'name\tother\napp\tpublic';
  });
  const connection = {
    driver: 'postgresql' as const,
    password: 'segredo',
    database: 'app',
  };
  assert.deepEqual(await service.listDatabases(connection), [{ name: 'app' }]);
  assert.equal(calls[0]?.command, 'psql');
  assert.equal(calls[0]?.args.includes('segredo'), false);
  assert.equal(calls[0]?.env.PGPASSWORD, 'segredo');
  assert.equal(calls[0]?.env.PGDATABASE, 'app');
  assert.deepEqual(await service.listTables(connection), [
    { schema: 'app', name: 'public' },
  ]);
});

test('usa o banco postgres quando o PostgreSQL não recebe um banco padrão', async () => {
  let environment: NodeJS.ProcessEnv | undefined;
  const service = new DatabaseReadonlyService(async (_command, _args, env) => {
    environment = env;
    return 'name\npostgres';
  });
  await service.listDatabases({ driver: 'postgresql', username: 'felipe' });
  assert.equal(environment?.PGDATABASE, 'postgres');
});

test('bloqueia consultas de escrita, múltiplas instruções e hosts remotos', async () => {
  const service = new DatabaseReadonlyService(async () => 'id\n1');
  await assert.rejects(
    () => service.query({ driver: 'mysql' }, "UPDATE users SET name = 'x'"),
    (error: unknown) =>
      error instanceof DatabaseReadonlyError &&
      error.reason === 'invalid-query',
  );
  await assert.rejects(
    () => service.query({ driver: 'mysql' }, 'SELECT 1; SELECT 2'),
    /Somente/,
  );
  await assert.rejects(
    () => service.listDatabases({ driver: 'postgresql', host: 'db.example' }),
    /apenas bancos locais/,
  );
});

test('limita o resultado da consulta a cem linhas', async () => {
  const output = [
    'id',
    ...Array.from({ length: 101 }, (_, index) => String(index)),
  ].join('\n');
  const service = new DatabaseReadonlyService(async () => output);
  const result = await service.query(
    { driver: 'postgresql' },
    'SELECT id FROM users',
  );
  assert.equal(result.rows.length, 100);
  assert.equal(result.rowCount, 101);
  assert.equal(result.truncated, true);
});
