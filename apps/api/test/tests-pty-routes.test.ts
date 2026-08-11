import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';

import { registerApiErrorHandling } from '../src/http/api-error.js';
import { testRoutes } from '../src/routes/tests.js';

function baseOptions(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    processManager: {} as never,
    testDetectionService: {} as never,
    testExecutionHistoryService: {} as never,
    projectStore: {
      findProject: () => ({ id: 'projeto-1' }),
    } as never,
    projectTestPtyService: {
      snapshot: () => undefined,
      start: async () => ({
        status: 'running',
        exitCode: null,
        exitSignal: null,
        startedAt: '2026-08-11T10:00:00.000Z',
        endedAt: null,
      }),
      cancel: () => undefined,
      attach: () => undefined,
    } as never,
    ...overrides,
  };
}

test('GET /api/projects/:id/tests/pty/status retorna null sem execução em andamento', async (t) => {
  const app = Fastify();
  registerApiErrorHandling(app);
  t.after(() => app.close());

  await app.register(testRoutes, baseOptions());

  const response = await app.inject({
    url: '/projects/projeto-1/tests/pty/status',
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { snapshot: null });
});

test('POST /api/projects/:id/tests/pty/start retorna 201 com o snapshot', async (t) => {
  const app = Fastify();
  registerApiErrorHandling(app);
  t.after(() => app.close());

  await app.register(testRoutes, baseOptions());

  const response = await app.inject({
    method: 'POST',
    url: '/projects/projeto-1/tests/pty/start',
    payload: { commandId: 'full-suite' },
  });

  assert.equal(response.statusCode, 201);
  assert.equal(
    response.json<{ snapshot: { status: string } }>().snapshot.status,
    'running',
  );
});

test('POST /api/projects/:id/tests/pty/start traduz TEST_COMMAND_NOT_FOUND em 404', async (t) => {
  const app = Fastify();
  registerApiErrorHandling(app);
  t.after(() => app.close());

  const { ProjectTestPtyError } =
    await import('../src/services/project-test-pty-service.js');

  await app.register(
    testRoutes,
    baseOptions({
      projectTestPtyService: {
        snapshot: () => undefined,
        start: async () => {
          throw new ProjectTestPtyError(
            'TEST_COMMAND_NOT_FOUND',
            'Comando de teste não encontrado para este projeto.',
          );
        },
        cancel: () => undefined,
        attach: () => undefined,
      },
    }),
  );

  const response = await app.inject({
    method: 'POST',
    url: '/projects/projeto-1/tests/pty/start',
    payload: { commandId: 'inexistente' },
  });

  assert.equal(response.statusCode, 404);
  assert.equal(
    response.json<{ error?: string }>().error,
    'TEST_COMMAND_NOT_FOUND',
  );
});

test('POST /api/projects/:id/tests/pty/start traduz ALREADY_RUNNING em 409', async (t) => {
  const app = Fastify();
  registerApiErrorHandling(app);
  t.after(() => app.close());

  const { ProjectTestPtyError } =
    await import('../src/services/project-test-pty-service.js');

  await app.register(
    testRoutes,
    baseOptions({
      projectTestPtyService: {
        snapshot: () => undefined,
        start: async () => {
          throw new ProjectTestPtyError(
            'ALREADY_RUNNING',
            'Já existe uma execução em andamento para esta chave.',
          );
        },
        cancel: () => undefined,
        attach: () => undefined,
      },
    }),
  );

  const response = await app.inject({
    method: 'POST',
    url: '/projects/projeto-1/tests/pty/start',
    payload: { commandId: 'full-suite' },
  });

  assert.equal(response.statusCode, 409);
});

test('POST /api/projects/:id/tests/pty/cancel retorna ok', async (t) => {
  const app = Fastify();
  registerApiErrorHandling(app);
  t.after(() => app.close());

  let cancelled = false;
  await app.register(
    testRoutes,
    baseOptions({
      projectTestPtyService: {
        snapshot: () => undefined,
        start: async () => ({}),
        cancel: () => {
          cancelled = true;
        },
        attach: () => undefined,
      },
    }),
  );

  const response = await app.inject({
    method: 'POST',
    url: '/projects/projeto-1/tests/pty/cancel',
    payload: {},
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { ok: true });
  assert.equal(cancelled, true);
});

test('GET /api/projects/:id/tests/pty/status retorna 404 para projeto inexistente', async (t) => {
  const app = Fastify();
  registerApiErrorHandling(app);
  t.after(() => app.close());

  await app.register(
    testRoutes,
    baseOptions({
      projectStore: { findProject: () => undefined },
    }),
  );

  const response = await app.inject({
    url: '/projects/does-not-exist/tests/pty/status',
  });

  assert.equal(response.statusCode, 404);
});
