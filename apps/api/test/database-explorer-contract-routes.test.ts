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

test('rejeita propriedades extras no corpo antes de chamar o serviço', async (context) => {
  let calls = 0;
  const databaseReadonlyService = {
    async listDatabases() {
      calls += 1;
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

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error, 'VALIDATION_ERROR');
  assert.equal(calls, 0);
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
