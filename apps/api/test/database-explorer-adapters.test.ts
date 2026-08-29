import assert from 'node:assert/strict';
import test from 'node:test';

import { DatabaseExplorerAdapterError } from '../src/services/database-explorer-adapter.js';
import {
  type MysqlExplorerClient,
  type MysqlExplorerClientFactory,
  MysqlExplorerAdapter,
} from '../src/services/mysql-explorer-adapter.js';
import {
  type PostgresExplorerClient,
  type PostgresExplorerClientFactory,
  PostgresExplorerAdapter,
} from '../src/services/postgres-explorer-adapter.js';

function postgresFactory(options: {
  onQuery: (
    sql: string,
  ) => { columns: string[]; rows: unknown[][] } | Promise<never>;
  onControlQuery?: (sql: string) => void;
  onEnd?: () => void;
  onConfig?: (config: Parameters<PostgresExplorerClientFactory>[0]) => void;
  connectError?: unknown;
}): PostgresExplorerClientFactory {
  return (config) => {
    options.onConfig?.(config);
    const client = {
      async connect() {
        if (options.connectError) throw options.connectError;
      },
      async query(input: string | { text: string; rowMode: 'array' }) {
        if (typeof input === 'string') {
          options.onControlQuery?.(input);
          return {};
        }
        const result = await options.onQuery(input.text);
        return {
          fields: result.columns.map((name) => ({ name })),
          rows: result.rows,
        };
      },
      async end() {
        options.onEnd?.();
      },
    };
    return client as PostgresExplorerClient;
  };
}

function mysqlFactory(options: {
  onQuery: (sql: string) => { columns: string[]; rows: unknown[][] };
  onControlQuery?: (sql: string) => void;
  onDestroy?: () => void;
  onConfig?: (config: Parameters<MysqlExplorerClientFactory>[0]) => void;
}): MysqlExplorerClientFactory {
  return async (config) => {
    options.onConfig?.(config);
    const client: MysqlExplorerClient = {
      async query(input) {
        if (typeof input === 'string') {
          options.onControlQuery?.(input);
          return [[], []];
        }
        const result = options.onQuery(input.sql);
        return [result.rows, result.columns.map((name) => ({ name }))];
      },
      async end() {},
      destroy() {
        options.onDestroy?.();
      },
    };
    return client;
  };
}

test('PostgresExplorerAdapter usa protocolo nativo em transação read-only', async () => {
  let receivedConfig: Parameters<PostgresExplorerClientFactory>[0] | undefined;
  const controlQueries: string[] = [];
  const adapter = new PostgresExplorerAdapter(
    postgresFactory({
      onConfig: (config) => {
        receivedConfig = config;
      },
      onControlQuery: (sql) => controlQueries.push(sql),
      onQuery: () => ({ columns: ['datname'], rows: [['app']] }),
    }),
  );

  const databases = await adapter.listDatabases({
    driver: 'postgresql',
    username: 'app_user',
    password: 'segredo',
  });

  assert.deepEqual(databases, [{ name: 'app' }]);
  assert.equal(receivedConfig?.user, 'app_user');
  assert.equal(receivedConfig?.password, 'segredo');
  assert.equal(receivedConfig?.database, 'postgres');
  assert.equal(receivedConfig?.statement_timeout, 15_000);
  assert.equal(receivedConfig?.query_timeout, 15_000);
  assert.deepEqual(controlQueries, ['BEGIN READ ONLY', 'ROLLBACK']);
});

test('PostgresExplorerAdapter preserva tab, newline, null e valores binários', async () => {
  const adapter = new PostgresExplorerAdapter(
    postgresFactory({
      onQuery: () => ({
        columns: ['tab', 'line', 'nullable', 'binary', 'big'],
        rows: [['a\tb', 'linha 1\nlinha 2', null, Buffer.from([0, 255]), 9n]],
      }),
    }),
  );

  const result = await adapter.query({ driver: 'postgresql' }, 'SELECT 1');

  assert.deepEqual(result, {
    columns: ['tab', 'line', 'nullable', 'binary', 'big'],
    rows: [['a\tb', 'linha 1\nlinha 2', null, '0x00ff', '9']],
    rowCount: 1,
    truncated: false,
  });
});

test('PostgresExplorerAdapter valida identificadores antes de abrir conexão', () => {
  let created = 0;
  const adapter = new PostgresExplorerAdapter(
    postgresFactory({
      onConfig: () => {
        created += 1;
      },
      onQuery: () => ({ columns: [], rows: [] }),
    }),
  );

  assert.throws(
    () => {
      void adapter.preview({ driver: 'postgresql' }, 'public', 'users;drop');
    },
    (error: unknown) =>
      error instanceof DatabaseExplorerAdapterError &&
      error.reason === 'invalid-query',
  );
  assert.equal(created, 0);
});

test('MysqlExplorerAdapter usa protocolo nativo em transação read-only', async () => {
  let receivedConfig: Parameters<MysqlExplorerClientFactory>[0] | undefined;
  let executedQuery = '';
  const controlQueries: string[] = [];
  const adapter = new MysqlExplorerAdapter(
    mysqlFactory({
      onConfig: (config) => {
        receivedConfig = config;
      },
      onControlQuery: (sql) => controlQueries.push(sql),
      onQuery: (sql) => {
        executedQuery = sql;
        return {
          columns: ['tab', 'line', 'nullable'],
          rows: [['a\tb', 'linha 1\nlinha 2', null]],
        };
      },
    }),
  );

  const result = await adapter.preview(
    { driver: 'mariadb', username: 'root', password: 'segredo' },
    'app',
    'users',
  );

  assert.equal(executedQuery, 'SELECT * FROM `app`.`users` LIMIT 101');
  assert.equal(receivedConfig?.user, 'root');
  assert.equal(receivedConfig?.password, 'segredo');
  assert.equal(receivedConfig?.rowsAsArray, true);
  assert.equal(receivedConfig?.dateStrings, true);
  assert.equal(receivedConfig?.bigNumberStrings, true);
  assert.deepEqual(controlQueries, ['START TRANSACTION READ ONLY', 'ROLLBACK']);
  assert.deepEqual(result.rows, [['a\tb', 'linha 1\nlinha 2', null]]);
});

test('resultado estruturado mantém rowCount e limita payload a cem linhas', async () => {
  const rows = Array.from({ length: 101 }, (_, index) => [index]);
  const adapter = new PostgresExplorerAdapter(
    postgresFactory({ onQuery: () => ({ columns: ['id'], rows }) }),
  );

  const result = await adapter.query(
    { driver: 'postgresql' },
    'SELECT id FROM users',
  );

  assert.equal(result.rows.length, 100);
  assert.equal(result.rowCount, 101);
  assert.equal(result.truncated, true);
});

test('erros de autenticação viram contrato estável sem vazar segredo', async () => {
  const secret = 'senha-super-secreta';
  const adapter = new PostgresExplorerAdapter(
    postgresFactory({
      connectError: Object.assign(
        new Error(`password authentication failed: ${secret}`),
        { code: '28P01' },
      ),
      onQuery: () => ({ columns: [], rows: [] }),
    }),
  );

  await assert.rejects(
    () =>
      adapter.query(
        { driver: 'postgresql', username: 'app', password: secret },
        'SELECT 1',
      ),
    (error: unknown) =>
      error instanceof DatabaseExplorerAdapterError &&
      error.reason === 'credentials-rejected' &&
      !error.message.includes(secret),
  );
});

test('AbortSignal encerra a conexão PostgreSQL e retorna aborted', async () => {
  let endCalls = 0;
  const adapter = new PostgresExplorerAdapter(
    postgresFactory({
      onEnd: () => {
        endCalls += 1;
      },
      onQuery: () => new Promise<never>(() => undefined),
    }),
  );
  const controller = new AbortController();

  const pending = adapter.query(
    { driver: 'postgresql' },
    'SELECT id FROM users',
    controller.signal,
  );
  controller.abort();

  await assert.rejects(
    pending,
    (error: unknown) =>
      error instanceof DatabaseExplorerAdapterError &&
      error.reason === 'aborted',
  );
  assert.equal(endCalls, 1);
});
