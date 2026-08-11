import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';

import { ProcessManagerError } from '@dev-dashboard/process-manager';

import { registerApiErrorHandling } from '../src/http/api-error.js';
import { processRoutes } from '../src/routes/processes.js';

// O comportamento de streaming (reemitir só quando o log muda, heartbeat,
// encerrar ao desconectar) é coberto isoladamente em log-event-stream.test.ts,
// sem depender de app.inject() aguardar um stream infinito terminar.

test('GET /api/projects/:id/process/logs/events traduz PROCESS_NOT_FOUND em 404 antes de assumir o stream', async (t) => {
  const app = Fastify();
  registerApiErrorHandling(app);
  t.after(() => app.close());

  const processManager = {
    readServerLog: async () => {
      throw new ProcessManagerError(
        'PROCESS_NOT_FOUND',
        'Nenhum processo gerenciado foi encontrado.',
      );
    },
  } as never;

  await app.register(processRoutes, {
    processManager,
    serverSettingsRepository: {} as never,
    serverHealthCheckService: {} as never,
    projectStore: {
      findProject: () => ({ id: 'projeto-1' }),
    } as never,
  });

  const response = await app.inject({
    url: '/projects/projeto-1/process/logs/events',
  });

  assert.equal(response.statusCode, 404);
  assert.equal(response.json<{ error?: string }>().error, 'PROCESS_NOT_FOUND');
});

test('GET /api/projects/:id/process/logs/events retorna 404 para projeto inexistente', async (t) => {
  const app = Fastify();
  registerApiErrorHandling(app);
  t.after(() => app.close());

  await app.register(processRoutes, {
    processManager: {} as never,
    serverSettingsRepository: {} as never,
    serverHealthCheckService: {} as never,
    projectStore: {
      findProject: () => undefined,
    } as never,
  });

  const response = await app.inject({
    url: '/projects/does-not-exist/process/logs/events',
  });

  assert.equal(response.statusCode, 404);
});
