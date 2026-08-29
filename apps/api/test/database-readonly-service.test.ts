import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  MachineDatabaseConnection,
  MachineDatabaseQueryResult,
} from '@dev-dashboard/contracts';

import type { DatabaseExplorerAdapter } from '../src/services/database-explorer-adapter.js';
import {
  DatabaseReadonlyError,
  DatabaseReadonlyService,
} from '../src/services/database-readonly-service.js';

const emptyResult: MachineDatabaseQueryResult = {
  columns: [],
  rows: [],
  rowCount: 0,
  truncated: false,
};

function createAdapter(
  query: DatabaseExplorerAdapter['query'] = async () => emptyResult,
): DatabaseExplorerAdapter {
  return {
    listDatabases: async () => [{ name: 'app' }],
    listTables: async () => [{ schema: 'public', name: 'users' }],
    preview: async () => emptyResult,
    query,
  };
}

function createService(
  options: {
    postgresAdapter?: DatabaseExplorerAdapter;
    mysqlAdapter?: DatabaseExplorerAdapter;
  } = {},
): DatabaseReadonlyService {
  return new DatabaseReadonlyService({
    postgresAdapter: options.postgresAdapter ?? createAdapter(),
    mysqlAdapter: options.mysqlAdapter ?? createAdapter(),
  });
}

test('roteia PostgreSQL e MySQL/MariaDB para seus adapters', async () => {
  const postgresConnections: MachineDatabaseConnection[] = [];
  const mysqlConnections: MachineDatabaseConnection[] = [];
  const postgresAdapter = createAdapter(async (connection) => {
    postgresConnections.push(connection);
    return {
      ...emptyResult,
      columns: ['driver'],
      rows: [['postgresql']],
      rowCount: 1,
    };
  });
  const mysqlAdapter = createAdapter(async (connection) => {
    mysqlConnections.push(connection);
    return {
      ...emptyResult,
      columns: ['driver'],
      rows: [[connection.driver]],
      rowCount: 1,
    };
  });
  const service = createService({ postgresAdapter, mysqlAdapter });

  assert.deepEqual(
    (await service.query({ driver: 'postgresql' }, 'SELECT 1')).rows,
    [['postgresql']],
  );
  assert.deepEqual((await service.query({ driver: 'mysql' }, 'SELECT 1')).rows, [
    ['mysql'],
  ]);
  assert.deepEqual(
    (await service.query({ driver: 'mariadb' }, 'SELECT 1')).rows,
    [['mariadb']],
  );
  assert.equal(postgresConnections.length, 1);
  assert.equal(mysqlConnections.length, 2);
});

test('bloqueia consultas de escrita, múltiplas instruções e hosts remotos', async () => {
  const service = createService();
  await assert.rejects(
    () => service.query({ driver: 'mysql' }, "UPDATE users SET name = 'x'"),
    (error: unknown) =>
      error instanceof DatabaseReadonlyError && error.reason === 'invalid-query',
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

test('bloqueia SELECTs com efeitos colaterais conhecidos antes do adapter', async () => {
  let calls = 0;
  const adapter = createAdapter(async () => {
    calls += 1;
    return emptyResult;
  });
  const service = createService({
    postgresAdapter: adapter,
    mysqlAdapter: adapter,
  });

  const cases = [
    {
      driver: 'mysql' as const,
      query: "SELECT id FROM users INTO OUTFILE '/tmp/users.csv'",
    },
    {
      driver: 'mysql' as const,
      query: "SELECT id FROM users INTO DUMPFILE '/tmp/users.bin'",
    },
    {
      driver: 'mariadb' as const,
      query: "SELECT LOAD_FILE('/etc/passwd')",
    },
    {
      driver: 'postgresql' as const,
      query: 'SELECT * INTO users_copy FROM users',
    },
    {
      driver: 'postgresql' as const,
      query: "SELECT pg_notify('jobs', 'ready')",
    },
    {
      driver: 'postgresql' as const,
      query: 'SELECT pg_sleep(30)',
    },
    {
      driver: 'postgresql' as const,
      query: 'WITH lock AS (SELECT pg_advisory_lock(1)) SELECT * FROM lock',
    },
    {
      driver: 'postgresql' as const,
      query: 'SELECT * FROM users FOR UPDATE',
    },
  ];

  for (const current of cases) {
    await assert.rejects(
      () => service.query({ driver: current.driver }, current.query),
      (error: unknown) =>
        error instanceof DatabaseReadonlyError && error.reason === 'invalid-query',
    );
  }
  assert.equal(calls, 0);
});

test('normaliza query, limita linhas e propaga AbortSignal ao adapter', async () => {
  const receivedQueries: string[] = [];
  let receivedSignal: AbortSignal | undefined;
  const adapter = createAdapter(async (_connection, query, signal) => {
    receivedQueries.push(query);
    receivedSignal = signal;
    return {
      ...emptyResult,
      columns: ['id'],
      rows: [[1]],
      rowCount: 1,
    };
  });
  const service = createService({ mysqlAdapter: adapter });
  const controller = new AbortController();

  const result = await service.query(
    { driver: 'mysql' },
    "SELECT title FROM posts WHERE title = 'Fórum';",
    controller.signal,
  );
  await service.query({ driver: 'mysql' }, 'SELECT * FROM posts LIMIT 500');
  await service.query(
    { driver: 'mysql' },
    'SELECT * FROM posts LIMIT 20, 500',
  );
  await service.query(
    { driver: 'mysql' },
    'SELECT * FROM (SELECT * FROM posts LIMIT 500) nested',
  );

  assert.deepEqual(receivedQueries, [
    "SELECT title FROM posts WHERE title = 'Fórum' LIMIT 101",
    'SELECT * FROM posts LIMIT 101',
    'SELECT * FROM posts LIMIT 20, 101',
    'SELECT * FROM (SELECT * FROM posts LIMIT 500) nested LIMIT 101',
  ]);
  assert.equal(receivedSignal, controller.signal);
  assert.deepEqual(result.rows, [[1]]);
});
