import assert from 'node:assert/strict';
import { test } from 'node:test';

import Fastify from 'fastify';

import {
  healthRoutes,
  resolveRuntimeRevision,
} from '../src/routes/health.js';

const REVISION = 'a'.repeat(40);

test('resolveRuntimeRevision aceita somente SHA hexadecimal bounded', () => {
  assert.equal(
    resolveRuntimeRevision({ DEV_DASHBOARD_RUNTIME_REVISION: REVISION }),
    REVISION,
  );
  assert.equal(
    resolveRuntimeRevision({ DEV_DASHBOARD_RUNTIME_REVISION: ` ${REVISION} ` }),
    REVISION,
  );
  assert.equal(
    resolveRuntimeRevision({ DEV_DASHBOARD_RUNTIME_REVISION: 'main' }),
    undefined,
  );
  assert.equal(
    resolveRuntimeRevision({ DEV_DASHBOARD_RUNTIME_REVISION: 'g'.repeat(40) }),
    undefined,
  );
});

test('health mantém o JSON público e expõe a revision validada somente no header', async (context) => {
  const previousRevision = process.env.DEV_DASHBOARD_RUNTIME_REVISION;
  process.env.DEV_DASHBOARD_RUNTIME_REVISION = REVISION;

  const app = Fastify({ logger: false });
  await app.register(healthRoutes, { prefix: '/api' });

  context.after(async () => {
    await app.close();
    if (previousRevision === undefined) {
      delete process.env.DEV_DASHBOARD_RUNTIME_REVISION;
    } else {
      process.env.DEV_DASHBOARD_RUNTIME_REVISION = previousRevision;
    }
  });

  const response = await app.inject({ method: 'GET', url: '/api/health' });
  const body = response.json();

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['x-dev-dashboard-revision'], REVISION);
  assert.equal(body.status, 'ok');
  assert.equal(body.service, 'dev-dashboard-api');
  assert.equal(typeof body.timestamp, 'string');
  assert.equal('revision' in body, false);
});
