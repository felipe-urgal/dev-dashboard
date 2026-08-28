import assert from 'node:assert/strict';
import test from 'node:test';

import Fastify from 'fastify';

import { registerApiErrorHandling } from '../src/http/api-error.js';
import { databaseRoutes } from '../src/routes/database.js';
import type { DatabaseDetectionService } from '../src/services/database-detection-service.js';
import {
  DatabaseReadonlyError,
  type DatabaseReadonlyService,
} from '../src/services/database-readonly-service.js';
import type { DatabaseSnapshotService } from '../src/services/database-snapshot-service.js';
import type { ProjectStore } from '../src/store/project-store.js';

async function createApp(databaseReadonlyService: DatabaseReadonlyService) {
  const app = Fastify();
  registerApiErrorHandling(app);
  await app.register(databaseRoutes, {
    projectStore: {} as unknown as ProjectStore,
    databaseDetectionService: {} as unknown as DatabaseDetectionService,
    databaseSnapshotService: {} as unknown as DatabaseSnapshotService,
    databaseReadonlyService,
  });
  return app;
}

test('expõe código estável quando as credenciais do Explorer são rejeitadas', async (context) => {
  const databaseReadonlyService = {
    async listDatabases() {
      throw new DatabaseReadonlyError(
        'credentials-rejected',
        'Credenciais rejeitadas.',
      );
    },
  } as unknown as DatabaseReadonlyService;
  const app = await createApp(databaseReadonlyService);
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
  const databaseReadonlyService = {
    async listDatabases(connection: unknown) {
      calls += 1;
      receivedConnection = connection;
      return [];
    },
  } as unknown as DatabaseReadonlyService;
  const app = await createApp(databaseReadonlyService);
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
  const databaseReadonlyService = {
    async listDatabases() {
      throw new DatabaseReadonlyError(
        'connection-failed',
        'Não foi possível conectar ao serviço.',
      );
    },
  } as unknown as DatabaseReadonlyService;
  const app = await createApp(databaseReadonlyService);
  context.after(async () => app.close());

  const response = await app.inject({
    method: 'POST',
    url: '/database/explorer/catalog',
    payload: { driver: 'mysql' },
  });

  assert.equal(response.statusCode, 502);
  assert.equal(response.json().error, 'DATABASE_EXPLORER_CONNECTION_FAILED');
});
