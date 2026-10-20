import assert from 'node:assert/strict';
import test from 'node:test';

import type { HostServiceInventory } from '@dev-dashboard/contracts';

import { buildApp } from '../src/app.js';

const TOKEN = 'h'.repeat(64);

test('inventário systemd é autenticado, read-only e serializa o contrato', async (context) => {
  let calls = 0;
  const observation: HostServiceInventory = {
    status: 'ready',
    observedAt: '2026-10-19T12:00:00.000Z',
    services: [
      {
        id: 'systemd:system:home-music.service',
        name: 'home-music.service',
        provider: 'systemd',
        scope: 'system',
        state: 'running',
        readiness: 'unknown',
        bootState: 'enabled',
        managed: false,
        observedAt: '2026-10-19T12:00:00.000Z',
      },
    ],
    sources: [
      { scope: 'user', status: 'ready' },
      { scope: 'system', status: 'ready' },
    ],
    truncated: false,
  };
  const app = await buildApp({
    localToken: TOKEN,
    hostServiceInventory: {
      inspect: async () => {
        calls += 1;
        return observation;
      },
    },
  });
  context.after(async () => app.close());

  const denied = await app.inject({
    method: 'GET',
    url: '/api/services/inventory',
  });
  assert.equal(denied.statusCode, 401);
  assert.equal(calls, 0);

  const response = await app.inject({
    method: 'GET',
    url: '/api/services/inventory',
    headers: { 'x-dev-dashboard-token': TOKEN },
  });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(
    response.json<{ inventory: HostServiceInventory }>().inventory,
    observation,
  );
  assert.equal(calls, 1);

  const paged = await app.inject({
    method: 'GET',
    url: '/api/services/inventory?offset=1&limit=1',
    headers: { 'x-dev-dashboard-token': TOKEN },
  });
  assert.equal(paged.statusCode, 200);
  const page = paged.json<{
    inventory: HostServiceInventory & {
      page: { offset: number; hasMore: boolean; incomplete: boolean };
    };
  }>().inventory;
  assert.deepEqual(page.services, []);
  assert.deepEqual(page.page, {
    offset: 1,
    limit: 1,
    hasMore: false,
    incomplete: false,
  });

  const invalid = await app.inject({
    method: 'GET',
    url: '/api/services/inventory?limit=999',
    headers: { 'x-dev-dashboard-token': TOKEN },
  });
  assert.equal(invalid.statusCode, 400);

  const mutation = await app.inject({
    method: 'POST',
    url: '/api/services/inventory',
    headers: { 'x-dev-dashboard-token': TOKEN },
  });
  assert.notEqual(mutation.statusCode, 200);
  assert.equal(calls, 2);
});
