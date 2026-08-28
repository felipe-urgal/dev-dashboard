import assert from 'node:assert/strict';
import test from 'node:test';

import Fastify from 'fastify';

import { registerApiErrorHandling } from '../src/http/api-error.js';
import { databaseRoutes } from '../src/routes/database.js';
import type { DatabaseDetectionService } from '../src/services/database-detection-service.js';
import {
  DatabaseExplorerError,
  type DatabaseExplorerService,
} from '../src/services/database-explorer-service.js';
import type { DatabaseSnapshotService } from '../src/services/database-snapshot-service.js';
import type { ProjectStore } from '../src/store/project-store.js';

async function createApp(databaseExplorerService: DatabaseExplorerService) {
  const app = Fastify();
  registerApiErrorHandling(app);
  await app.register(databaseRoutes, {
    projectStore: {} as unknown as ProjectStore,
    databaseDetectionService: {} as unknown as DatabaseDetectionService,
    databaseSnapshotService: {} as unknown as DatabaseSnapshotService,
    databaseExplorerService,
  });
  return app;
}

test('expõe código estável quando as credenciais do Explorer são rejeitadas', async (context) => {
  const databaseExplorerService = {
    async listDatabases() {
      throw new DatabaseExplorerError(
        'credentials-rejected',
        'Credenciais rejeitadas.',
      );
    },
  } as unknown as DatabaseExplorerService;
  const app = await createApp(databaseExplorerService);
  context.after(async () => app.close());

  const response = await app.inject({
    method: 'POST',
    url: '/database/explorer/catalog',
    payload: {
      driver: 'postgresql',
      username: 'app',
      password: 'segredo',
    },
  });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.json(), {
    error: 'DATABASE_EXPLORER_CREDENTIALS_REJECTED',
    message: 'Credenciais rejeitadas.',
  });
  assert.equal(response.body.includes('segredo'), false);
});

test('remove propriedades extras do corpo antes de chamar o serviço', async (context) => {
  let calls = 0;
  let receivedConnection: unknown;
  const databaseExplorerService = {
    async listDatabases(connection: unknown) {
      calls += 1;
      receivedConnection = connection;
      return [];
    },
  } as unknown as DatabaseExplorerService;
  const app = await createApp(databaseExplorerService);
  context.after(async () => app.close());

  const response = await app.inject({
    method: 'POST',
    url: '/database/explorer/catalog',
    payload: {
      driver: 'postgresql',
      propriedadeInesperada: true,
    },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { databases: [] });
  assert.equal(calls, 1);
  assert.deepEqual(receivedConnection, { driver: 'postgresql' });
});

test('diferencia falha de conexão de erro genérico do comando', async (context) => {
  const databaseExplorerService = {
    async listDatabases() {
      throw new DatabaseExplorerError(
        'connection-failed',
        'Não foi possível conectar ao serviço.',
      );
    },
  } as unknown as DatabaseExplorerService;
  const app = await createApp(databaseExplorerService);
  context.after(async () => app.close());

  const response = await app.inject({
    method: 'POST',
    url: '/database/explorer/catalog',
    payload: { driver: 'mysql' },
  });

  assert.equal(response.statusCode, 502);
  assert.equal(response.json().error, 'DATABASE_EXPLORER_CONNECTION_FAILED');
});
