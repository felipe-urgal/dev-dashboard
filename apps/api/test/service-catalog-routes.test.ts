import assert from 'node:assert/strict';
import test from 'node:test';

import type { ServiceCatalogSnapshot } from '@dev-dashboard/contracts';
import { buildApp } from '../src/app.js';

const TOKEN = 'z'.repeat(64);

test('catalog endpoint is authenticated and read-only', async (context) => {
  let calls = 0;
  const catalog: ServiceCatalogSnapshot = {
    status: 'partial',
    observedAt: '2026-10-19T15:00:00.000Z',
    entries: [],
    ports: [],
    truncated: false,
    providers: [
      { provider: 'systemd', status: 'unavailable' },
      { provider: 'docker', status: 'ready' },
      { provider: 'compose', status: 'ready' },
      { provider: 'managed-process', status: 'ready' },
      { provider: 'ports', status: 'ready' },
    ],
  };
  const app = await buildApp({
    localToken: TOKEN,
    serviceCatalog: {
      inspect: async () => {
        calls++;
        return catalog;
      },
    },
  });
  context.after(async () => app.close());

  const denied = await app.inject({
    method: 'GET',
    url: '/api/services/catalog',
  });
  assert.equal(denied.statusCode, 401);
  assert.equal(calls, 0);

  const result = await app.inject({
    method: 'GET',
    url: '/api/services/catalog',
    headers: { 'x-dev-dashboard-token': TOKEN },
  });
  assert.equal(result.statusCode, 200);
  assert.deepEqual(
    result.json<{ catalog: ServiceCatalogSnapshot }>().catalog,
    catalog,
  );
  assert.equal(calls, 1);

  const paged = await app.inject({
    method: 'GET',
    url: '/api/services/catalog?offset=0&limit=1',
    headers: { 'x-dev-dashboard-token': TOKEN },
  });
  assert.equal(paged.statusCode, 200);
  assert.deepEqual(
    paged.json<{
      catalog: ServiceCatalogSnapshot & {
        page: {
          offset: number;
          limit: number;
          hasMore: boolean;
          incomplete: boolean;
        };
      };
    }>().catalog.page,
    { offset: 0, limit: 1, hasMore: false, incomplete: false },
  );
  const badOffset = await app.inject({
    method: 'GET',
    url: '/api/services/catalog?offset=-1',
    headers: { 'x-dev-dashboard-token': TOKEN },
  });
  assert.equal(badOffset.statusCode, 400);

  const deniedMutation = await app.inject({
    method: 'POST',
    url: '/api/services/catalog',
    headers: { 'x-dev-dashboard-token': TOKEN },
  });
  assert.notEqual(deniedMutation.statusCode, 200);
  assert.equal(calls, 2);
});
