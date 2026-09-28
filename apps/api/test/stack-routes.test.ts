import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { Stack } from '@dev-dashboard/contracts';

import { buildApp } from '../src/app.js';
import { createAppContext } from '../src/app-context.js';
import { StackStore } from '../src/store/stack-store.js';

const TOKEN = 's'.repeat(64);

function stack(): Stack {
  return {
    id: 'local-stack',
    name: 'Local stack',
    nodes: [
      {
        id: 'postgres',
        name: 'Postgres',
        target: {
          kind: 'compose-service',
          projectId: 'api',
          environmentInstanceId: 'environment:primary:api',
          service: 'postgres',
        },
      },
      {
        id: 'api',
        name: 'API',
        target: {
          kind: 'environment',
          projectId: 'api',
          environmentInstanceId: 'environment:primary:api',
        },
      },
    ],
    dependencies: [{ nodeId: 'api', dependsOnNodeId: 'postgres' }],
  };
}

test('Stack HTTP expõe CRUD autenticado e valida a topologia antes de persistir', async (context) => {
  const stateDirectory = mkdtempSync(
    path.join(os.tmpdir(), 'dev-dashboard-stack-routes-'),
  );
  const appContext = createAppContext();
  appContext.stackStore = new StackStore({ stateDirectory });
  const app = await buildApp({ localToken: TOKEN, context: appContext });

  context.after(async () => {
    await app.close();
    rmSync(stateDirectory, { recursive: true, force: true });
  });

  const unauthorized = await app.inject({
    method: 'GET',
    url: '/api/stacks',
  });
  assert.equal(unauthorized.statusCode, 401);

  const headers = {
    'x-dev-dashboard-token': TOKEN,
    'content-type': 'application/json',
  };

  const created = await app.inject({
    method: 'PUT',
    url: '/api/stacks/local-stack',
    headers,
    payload: stack(),
  });
  assert.equal(created.statusCode, 200);
  assert.deepEqual(created.json<{ stack: Stack }>().stack, stack());

  const listed = await app.inject({
    method: 'GET',
    url: '/api/stacks',
    headers,
  });
  assert.equal(listed.statusCode, 200);
  assert.deepEqual(listed.json<{ stacks: Stack[] }>().stacks, [stack()]);

  const fetched = await app.inject({
    method: 'GET',
    url: '/api/stacks/local-stack',
    headers,
  });
  assert.equal(fetched.statusCode, 200);
  assert.equal(fetched.json<{ stack: Stack }>().stack.name, 'Local stack');

  const mismatch = await app.inject({
    method: 'PUT',
    url: '/api/stacks/other-stack',
    headers,
    payload: stack(),
  });
  assert.equal(mismatch.statusCode, 400);
  assert.equal(mismatch.json<{ error: string }>().error, 'BAD_REQUEST');

  const cyclic = stack();
  cyclic.dependencies.push({
    nodeId: 'postgres',
    dependsOnNodeId: 'api',
  });
  const rejected = await app.inject({
    method: 'PUT',
    url: '/api/stacks/local-stack',
    headers,
    payload: cyclic,
  });
  assert.equal(rejected.statusCode, 409);
  assert.equal(rejected.json<{ error: string }>().error, 'CONFLICT');

  const removed = await app.inject({
    method: 'DELETE',
    url: '/api/stacks/local-stack',
    headers,
  });
  assert.equal(removed.statusCode, 204);

  const missing = await app.inject({
    method: 'GET',
    url: '/api/stacks/local-stack',
    headers,
  });
  assert.equal(missing.statusCode, 404);
  assert.equal(missing.json<{ error: string }>().error, 'NOT_FOUND');
});

test('Stack HTTP rejeita payloads com propriedades extras e nodes vazios', async (context) => {
  const app = await buildApp({ localToken: TOKEN });
  context.after(async () => app.close());

  const headers = {
    'x-dev-dashboard-token': TOKEN,
    'content-type': 'application/json',
  };

  const extraProperty = await app.inject({
    method: 'PUT',
    url: '/api/stacks/local-stack',
    headers,
    payload: { ...stack(), unexpected: true },
  });
  assert.equal(extraProperty.statusCode, 400);

  const empty = stack();
  empty.nodes = [];
  const emptyNodes = await app.inject({
    method: 'PUT',
    url: '/api/stacks/local-stack',
    headers,
    payload: empty,
  });
  assert.equal(emptyNodes.statusCode, 400);
});
