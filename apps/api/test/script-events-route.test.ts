import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';
import type { ScriptExecutionService } from '../src/services/script-execution-service.js';
import { scriptRoutes } from '../src/routes/scripts.js';

test('remove propriedades fora do contrato nos eventos SSE', async (t) => {
  const app = Fastify();
  t.after(() => app.close());
  const execution = {
    id: 'execucao-1',
    projectId: 'projeto-1',
    actionId: 'package-script:lint',
    actionName: 'lint',
    risk: 'read-only',
    status: 'succeeded',
    startedAt: new Date().toISOString(),
    segredoInterno: 'não deve sair',
  };
  const scriptExecutionService = {
    subscribe: async (
      _projectId: string,
      _executionId: string,
      subscriber: { send: (event: unknown) => void; close: () => void },
    ) => {
      subscriber.send({ type: 'state', execution });
      queueMicrotask(subscriber.close);
      return () => undefined;
    },
  } as unknown as ScriptExecutionService;
  await app.register(scriptRoutes, {
    projectStore: { findProject: () => ({ id: 'projeto-1' }) } as never,
    scriptDetectionService: {} as never,
    scriptExecutionService,
  });

  const response = await app.inject({
    url: '/projects/projeto-1/scripts/executions/execucao-1/events',
  });
  assert.equal(response.statusCode, 200);
  assert.match(response.body, /"type":"state"/);
  assert.equal(response.body.includes('segredoInterno'), false);
});
