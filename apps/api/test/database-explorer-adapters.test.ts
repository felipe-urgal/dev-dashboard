import assert from 'node:assert/strict';
import test from 'node:test';

import { DatabaseExplorerAdapterError } from '../src/services/database-explorer-adapter.js';
import { MysqlExplorerAdapter } from '../src/services/mysql-explorer-adapter.js';
import { PostgresExplorerAdapter } from '../src/services/postgres-explorer-adapter.js';

test('PostgresExplorerAdapter encapsula cliente, read-only e credenciais', async () => {
  let received:
    | {
        command: string;
        args: string[];
        env: NodeJS.ProcessEnv;
      }
    | undefined;
  const adapter = new PostgresExplorerAdapter(async (command, args, env) => {
    received = { command, args, env };
    return 'datname\napp';
  });

  const databases = await adapter.listDatabases({
    driver: 'postgresql',
    username: 'app_user',
    password: 'segredo',
  });

  assert.deepEqual(databases, [{ name: 'app' }]);
  assert.equal(received?.command, 'psql');
  assert.equal(received?.args.includes('segredo'), false);
  assert.equal(received?.env.PGUSER, 'app_user');
  assert.equal(received?.env.PGPASSWORD, 'segredo');
  assert.equal(received?.env.PGDATABASE, 'postgres');
  assert.match(
    received?.env.PGOPTIONS ?? '',
    /default_transaction_read_only=on/,
  );
  assert.match(received?.env.PGOPTIONS ?? '', /statement_timeout=15000/);
});

test('PostgresExplorerAdapter monta preview com identificadores validados', async () => {
  let executedQuery = '';
  let calls = 0;
  const adapter = new PostgresExplorerAdapter(async (_command, args) => {
    calls += 1;
    executedQuery = args[args.indexOf('-c') + 1] ?? '';
    return 'id\n1';
  });

  await adapter.preview({ driver: 'postgresql' }, 'public', 'users');
  assert.equal(executedQuery, 'SELECT * FROM "public"."users" LIMIT 101');

  await assert.rejects(
    () => adapter.preview({ driver: 'postgresql' }, 'public', 'users;drop'),
    (error: unknown) =>
      error instanceof DatabaseExplorerAdapterError &&
      error.reason === 'invalid-query',
  );
  assert.equal(calls, 1);
});

test('MysqlExplorerAdapter encapsula cliente, read-only e credenciais', async () => {
  let received:
    | {
        command: string;
        args: string[];
        env: NodeJS.ProcessEnv;
      }
    | undefined;
  const adapter = new MysqlExplorerAdapter(async (command, args, env) => {
    received = { command, args, env };
    return 'schema_name\napp';
  });

  const databases = await adapter.listDatabases({
    driver: 'mysql',
    username: 'root',
    password: 'segredo',
  });

  assert.deepEqual(databases, [{ name: 'app' }]);
  assert.equal(received?.command, 'mysql');
  assert.equal(received?.args.includes('segredo'), false);
  assert.equal(received?.args.includes('--host'), true);
  assert.equal(received?.args.includes('127.0.0.1'), true);
  assert.equal(
    received?.args.includes('--init-command=SET SESSION TRANSACTION READ ONLY'),
    true,
  );
  assert.equal(received?.env.MYSQL_USER, 'root');
  assert.equal(received?.env.MYSQL_PWD, 'segredo');
});

test('MysqlExplorerAdapter atende MariaDB pelo mesmo protocolo', async () => {
  let command = '';
  let executedQuery = '';
  const adapter = new MysqlExplorerAdapter(async (currentCommand, args) => {
    command = currentCommand;
    executedQuery = args[args.indexOf('--execute') + 1] ?? '';
    return 'id\n1';
  });

  await adapter.query({ driver: 'mariadb' }, 'SELECT 1');

  assert.equal(command, 'mysql');
  assert.equal(executedQuery, 'SELECT 1');
});

test('MysqlExplorerAdapter monta preview com quoting próprio', async () => {
  let executedQuery = '';
  const adapter = new MysqlExplorerAdapter(async (_command, args) => {
    executedQuery = args[args.indexOf('--execute') + 1] ?? '';
    return 'id\n1';
  });

  await adapter.preview({ driver: 'mysql' }, 'app', 'users');

  assert.equal(executedQuery, 'SELECT * FROM `app`.`users` LIMIT 101');
});
