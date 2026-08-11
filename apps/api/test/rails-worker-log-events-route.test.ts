import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';

import { registerApiErrorHandling } from '../src/http/api-error.js';
import { railsRoutes } from '../src/routes/rails.js';
import { RailsWorkerError } from '../src/services/rails-runtime-service.js';

// O comportamento de streaming em si é coberto isoladamente em
// log-event-stream.test.ts; aqui só validamos a tradução de erro antes de
// assumir o stream, igual à rota equivalente de logs do servidor.

test('GET /api/projects/:id/rails/workers/:workerId/logs/events traduz erro de worker antes de assumir o stream', async (t) => {
  const app = Fastify();
  registerApiErrorHandling(app);
  t.after(() => app.close());

  const railsRuntimeService = {
    readWorkerLog: async () => {
      throw new RailsWorkerError(
        'RAILS_WORKER_UNSUPPORTED',
        'O projeto não expõe este worker.',
      );
    },
  } as never;

  await app.register(railsRoutes, {
    projectStore: {
      findProject: () => ({ id: 'projeto-1' }),
    } as never,
    railsInspectionService: {} as never,
    railsRuntimeService,
  });

  const response = await app.inject({
    url: '/projects/projeto-1/rails/workers/sidekiq/logs/events',
  });

  assert.equal(response.statusCode, 409);
});

test('GET /api/projects/:id/rails/workers/:workerId/logs/events retorna 404 para projeto inexistente', async (t) => {
  const app = Fastify();
  registerApiErrorHandling(app);
  t.after(() => app.close());

  await app.register(railsRoutes, {
    projectStore: {
      findProject: () => undefined,
    } as never,
    railsInspectionService: {} as never,
    railsRuntimeService: {} as never,
  });

  const response = await app.inject({
    url: '/projects/does-not-exist/rails/workers/sidekiq/logs/events',
  });

  assert.equal(response.statusCode, 404);
});
