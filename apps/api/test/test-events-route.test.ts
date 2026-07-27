import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';

import type { TestExecutionHistoryService } from '../src/services/test-execution-history-service.js';
import { testRoutes } from '../src/routes/tests.js';
import { registerApiErrorHandling } from '../src/http/api-error.js';

test('remove propriedades fora do contrato nos eventos SSE de teste', async (t) => {
  const app = Fastify();
  t.after(() => app.close());
  const managedProcess = {
    id: 'projeto-1:test:node-script-test', projectId: 'projeto-1', kind: 'test', status: 'running',
    command: 'npm', args: ['run', 'test'], startedAt: new Date().toISOString(),
    cwd: '/caminho/interno/nao/deve/sair', logPath: '/outro/caminho/interno', host: '127.0.0.1',
  };
  const testExecutionHistoryService = {
    subscribe: async (_projectId: string, subscriber: { send: (event: unknown) => void; close: () => void }) => {
      subscriber.send({ type: 'state', process: managedProcess });
      queueMicrotask(subscriber.close);
      return () => undefined;
    },
  } as unknown as TestExecutionHistoryService;

  await app.register(testRoutes, {
    processManager: {} as never,
    projectStore: { findProject: () => ({ id: 'projeto-1' }) } as never,
    testDetectionService: {} as never,
    testExecutionHistoryService,
  });

  const response = await app.inject({
    url: '/projects/projeto-1/tests/process/events',
  });
  assert.equal(response.statusCode, 200);
  assert.match(response.body, /"type":"state"/);
  assert.equal(response.body.includes('cwd'), false);
  assert.equal(response.body.includes('logPath'), false);
  assert.equal(response.body.includes('host'), false);
  assert.equal(response.body.includes('caminho/interno'), false);
});

test('traduz TEST_EXECUTION_NOT_FOUND em 404', async (t) => {
  const app = Fastify();
  registerApiErrorHandling(app);
  t.after(() => app.close());
  const { TestExecutionSubscriptionError } = await import('../src/services/test-execution-history-service.js');
  const testExecutionHistoryService = {
    subscribe: async () => {
      throw new TestExecutionSubscriptionError('TEST_EXECUTION_NOT_FOUND', 'Não há execução de teste em andamento para este projeto.');
    },
  } as unknown as TestExecutionHistoryService;

  await app.register(testRoutes, {
    processManager: {} as never,
    projectStore: { findProject: () => ({ id: 'projeto-1' }) } as never,
    testDetectionService: {} as never,
    testExecutionHistoryService,
  });

  const response = await app.inject({ url: '/projects/projeto-1/tests/process/events' });
  assert.equal(response.statusCode, 404);
  assert.equal(response.json<{ error?: string }>().error, 'TEST_EXECUTION_NOT_FOUND');
});
