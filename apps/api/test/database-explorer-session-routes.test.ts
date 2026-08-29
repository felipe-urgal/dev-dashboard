import assert from 'node:assert/strict';
import test from 'node:test';

import Fastify from 'fastify';

import { registerApiErrorHandling } from '../src/http/api-error.js';
import { databaseExplorerSessionRoutes } from '../src/routes/database-explorer-sessions.js';
import type { DatabaseExplorerService } from '../src/services/database-explorer-service.js';
import { DatabaseExplorerSessionStore } from '../src/services/database-explorer-session-store.js';

async function createApp(
  databaseExplorerService: DatabaseExplorerService,
  databaseExplorerSessionStore: DatabaseExplorerSessionStore,
) {
  const app = Fastify();
  registerApiErrorHandling(app);
  await app.register(databaseExplorerSessionRoutes, {
    databaseExplorerService,
    databaseExplorerSessionStore,
  });
  return app;
}

test('cria sessão opaca sem devolver credenciais e reutiliza a conexão no catálogo', async (context) => {
  let receivedConnection: unknown;
  const databaseExplorerService = {
    async listDatabases(connection: unknown) {
      receivedConnection = connection;
      return [{ name: 'app_development' }];
    },
  } as unknown as DatabaseExplorerService;
  const store = new DatabaseExplorerSessionStore({
    ttlMs: 60_000,
    generateSessionId: () => 'opaque-session-id',
  });
  const app = await createApp(databaseExplorerService, store);
  context.after(async () => {
    store.close();
    await app.close();
  });

  const createResponse = await app.inject({
    method: 'POST',
    url: '/database/explorer/sessions',
    payload: {
      driver: 'postgresql',
      username: 'app',
      password: 'segredo',
    },
  });

  assert.equal(createResponse.statusCode, 201);
  assert.equal(createResponse.json().sessionId, 'opaque-session-id');
  assert.equal(typeof createResponse.json().expiresAt, 'string');
  assert.equal(createResponse.body.includes('segredo'), false);

  const catalogResponse = await app.inject({
    method: 'POST',
    url: '/database/explorer/sessions/opaque-session-id/catalog',
    payload: {},
  });

  assert.equal(catalogResponse.statusCode, 200);
  assert.deepEqual(catalogResponse.json(), {
    databases: [{ name: 'app_development' }],
  });
  assert.deepEqual(receivedConnection, {
    driver: 'postgresql',
    username: 'app',
    password: 'segredo',
  });
});

test('permite selecionar database sem reenviar credenciais', async (context) => {
  let receivedConnection: unknown;
  const databaseExplorerService = {
    async listTables(connection: unknown) {
      receivedConnection = connection;
      return [];
    },
  } as unknown as DatabaseExplorerService;
  const store = new DatabaseExplorerSessionStore({
    ttlMs: 60_000,
    generateSessionId: () => 'database-session',
  });
  store.create({
    driver: 'mysql',
    username: 'root',
    password: 'segredo',
  });
  const app = await createApp(databaseExplorerService, store);
  context.after(async () => {
    store.close();
    await app.close();
  });

  const response = await app.inject({
    method: 'POST',
    url: '/database/explorer/sessions/database-session/tables',
    payload: {
      database: 'app_development',
      password: 'nao-deve-ser-aceita',
    },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(receivedConnection, {
    driver: 'mysql',
    username: 'root',
    password: 'segredo',
    database: 'app_development',
  });
});

test('disconnect encerra a sessão e chamadas posteriores retornam sessão expirada', async (context) => {
  const databaseExplorerService = {
    async listDatabases() {
      return [];
    },
  } as unknown as DatabaseExplorerService;
  const store = new DatabaseExplorerSessionStore({
    ttlMs: 60_000,
    generateSessionId: () => 'disconnect-session',
  });
  store.create({ driver: 'postgresql' });
  const app = await createApp(databaseExplorerService, store);
  context.after(async () => {
    store.close();
    await app.close();
  });

  const deleteResponse = await app.inject({
    method: 'DELETE',
    url: '/database/explorer/sessions/disconnect-session',
  });
  assert.equal(deleteResponse.statusCode, 204);

  const response = await app.inject({
    method: 'POST',
    url: '/database/explorer/sessions/disconnect-session/catalog',
    payload: {},
  });

  assert.equal(response.statusCode, 410);
  assert.deepEqual(response.json(), {
    error: 'SESSION_EXPIRED',
    message: 'A sessão do Database Explorer expirou ou não existe.',
  });
});

test('sessão expirada é removida antes de executar operação', async (context) => {
  let now = 1_000;
  let calls = 0;
  const databaseExplorerService = {
    async listDatabases() {
      calls += 1;
      return [];
    },
  } as unknown as DatabaseExplorerService;
  const store = new DatabaseExplorerSessionStore({
    ttlMs: 500,
    now: () => now,
    generateSessionId: () => 'expired-session',
  });
  store.create({ driver: 'postgresql', password: 'segredo' });
  now = 1_501;
  const app = await createApp(databaseExplorerService, store);
  context.after(async () => {
    store.close();
    await app.close();
  });

  const response = await app.inject({
    method: 'POST',
    url: '/database/explorer/sessions/expired-session/catalog',
    payload: {},
  });

  assert.equal(response.statusCode, 410);
  assert.equal(calls, 0);
  assert.equal(store.delete('expired-session'), false);
});
