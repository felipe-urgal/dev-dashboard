import assert from 'node:assert/strict';

import { afterEach, test } from 'node:test';

import {
  startProjectTest,
  stopProjectTest,
} from '../src/api.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function managedProcessResponse(): Response {
  return Response.json({
    process: {
      id: 'projeto:test:vitest',
      projectId: 'projeto',
      kind: 'test',
      status: 'running',
      command: 'npm',
      args: ['run', 'test'],
      cwd: '/tmp/projeto',
      logPath: '/tmp/projeto.test.log',
      startedAt: new Date(0).toISOString(),
    },
  });
}

test('envia um objeto JSON ao iniciar testes', async () => {
  let receivedInput: RequestInfo | URL | undefined;
  let receivedInit: RequestInit | undefined;

  globalThis.fetch = async (input, init) => {
    receivedInput = input;
    receivedInit = init;
    return managedProcessResponse();
  };

  await startProjectTest('projeto', 'vitest');

  assert.equal(
    receivedInput,
    '/api/projects/projeto/tests/vitest/start',
  );
  assert.equal(receivedInit?.method, 'POST');
  assert.deepEqual(receivedInit?.headers, {
    'Content-Type': 'application/json',
  });
  assert.equal(receivedInit?.body, '{}');
});

test('envia um objeto JSON ao interromper testes', async () => {
  let receivedInit: RequestInit | undefined;

  globalThis.fetch = async (_input, init) => {
    receivedInit = init;
    return managedProcessResponse();
  };

  await stopProjectTest('projeto');

  assert.equal(receivedInit?.method, 'POST');
  assert.deepEqual(receivedInit?.headers, {
    'Content-Type': 'application/json',
  });
  assert.equal(receivedInit?.body, '{}');
});
