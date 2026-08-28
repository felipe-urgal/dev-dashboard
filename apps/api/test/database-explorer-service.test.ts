import assert from 'node:assert/strict';
import test from 'node:test';

import type { MachineDatabaseConnection } from '@dev-dashboard/contracts';

import {
  DatabaseExplorerError,
  DatabaseExplorerService,
  type DatabaseExplorerBackend,
} from '../src/services/database-explorer-service.js';
import { DatabaseReadonlyError } from '../src/services/database-readonly-service.js';

const connection: MachineDatabaseConnection = {
  driver: 'postgresql',
  host: '127.0.0.1',
  database: 'app',
};

test('delega operações do Explorer ao backend configurado', async () => {
  const calls: string[] = [];
  const backend: DatabaseExplorerBackend = {
    async listDatabases(receivedConnection) {
      assert.deepEqual(receivedConnection, connection);
      calls.push('catalog');
      return [{ name: 'app' }];
    },
    async listTables(receivedConnection) {
      assert.deepEqual(receivedConnection, connection);
      calls.push('tables');
      return [{ schema: 'public', name: 'users' }];
    },
    async preview(receivedConnection, schema, table) {
      assert.deepEqual(receivedConnection, connection);
      assert.equal(schema, 'public');
      assert.equal(table, 'users');
      calls.push('preview');
      return {
        columns: ['id'],
        rows: [['1']],
        rowCount: 1,
        truncated: false,
      };
    },
    async query(receivedConnection, query) {
      assert.deepEqual(receivedConnection, connection);
      assert.equal(query, 'select 1');
      calls.push('query');
      return {
        columns: ['value'],
        rows: [['1']],
        rowCount: 1,
        truncated: false,
      };
    },
  };

  const service = new DatabaseExplorerService(backend);

  assert.deepEqual(await service.listDatabases(connection), [{ name: 'app' }]);
  assert.deepEqual(await service.listTables(connection), [
    { schema: 'public', name: 'users' },
  ]);
  assert.equal(
    (await service.preview(connection, 'public', 'users')).rowCount,
    1,
  );
  assert.equal((await service.query(connection, 'select 1')).rowCount, 1);
  assert.deepEqual(calls, ['catalog', 'tables', 'preview', 'query']);
});

test('traduz falhas da infraestrutura para erro do domínio do Explorer', async () => {
  const backend: DatabaseExplorerBackend = {
    async listDatabases() {
      throw new DatabaseReadonlyError(
        'credentials-rejected',
        'Credenciais rejeitadas.',
      );
    },
    async listTables() {
      return [];
    },
    async preview() {
      return { columns: [], rows: [], rowCount: 0, truncated: false };
    },
    async query() {
      return { columns: [], rows: [], rowCount: 0, truncated: false };
    },
  };
  const service = new DatabaseExplorerService(backend);

  await assert.rejects(
    () => service.listDatabases(connection),
    (error: unknown) => {
      assert.ok(error instanceof DatabaseExplorerError);
      assert.equal(error.reason, 'credentials-rejected');
      assert.equal(error.message, 'Credenciais rejeitadas.');
      return true;
    },
  );
});

test('normaliza falha inesperada sem vazar detalhes internos', async () => {
  const backend: DatabaseExplorerBackend = {
    async listDatabases() {
      throw new Error('segredo interno');
    },
    async listTables() {
      return [];
    },
    async preview() {
      return { columns: [], rows: [], rowCount: 0, truncated: false };
    },
    async query() {
      return { columns: [], rows: [], rowCount: 0, truncated: false };
    },
  };
  const service = new DatabaseExplorerService(backend);

  await assert.rejects(
    () => service.listDatabases(connection),
    (error: unknown) => {
      assert.ok(error instanceof DatabaseExplorerError);
      assert.equal(error.reason, 'command-failed');
      assert.equal(
        error.message,
        'Não foi possível consultar o banco de dados.',
      );
      assert.equal(error.message.includes('segredo interno'), false);
      return true;
    },
  );
});
