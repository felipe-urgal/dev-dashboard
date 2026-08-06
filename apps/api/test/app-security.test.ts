import assert from 'node:assert/strict';

import { mkdtemp, rm } from 'node:fs/promises';

import { tmpdir } from 'node:os';

import path from 'node:path';

import { test } from 'node:test';

const TOKEN = 'b'.repeat(64);

test('protects the application routes', async (context) => {
  const fixtureRoot = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-api-security-'),
  );

  const previousConfigDirectory = process.env.DEV_DASHBOARD_CONFIG_DIR;

  const previousStateDirectory = process.env.DEV_DASHBOARD_STATE_DIR;

  process.env.DEV_DASHBOARD_CONFIG_DIR = path.join(fixtureRoot, 'config');

  process.env.DEV_DASHBOARD_STATE_DIR = path.join(fixtureRoot, 'state');

  const { buildApp } = await import('../src/app.js');

  const app = await buildApp({
    localToken: TOKEN,
  });

  context.after(async () => {
    await app.close();

    if (previousConfigDirectory === undefined) {
      delete process.env.DEV_DASHBOARD_CONFIG_DIR;
    } else {
      process.env.DEV_DASHBOARD_CONFIG_DIR = previousConfigDirectory;
    }

    if (previousStateDirectory === undefined) {
      delete process.env.DEV_DASHBOARD_STATE_DIR;
    } else {
      process.env.DEV_DASHBOARD_STATE_DIR = previousStateDirectory;
    }

    await rm(fixtureRoot, {
      recursive: true,
      force: true,
    });
  });

  const healthResponse = await app.inject({
    method: 'GET',
    url: '/api/health',
  });

  assert.equal(healthResponse.statusCode, 200);

  const unauthorizedResponse = await app.inject({
    method: 'GET',
    url: '/api/workspaces',
  });

  assert.equal(unauthorizedResponse.statusCode, 401);

  const authorizedResponse = await app.inject({
    method: 'GET',
    url: '/api/workspaces',
    headers: {
      'x-dev-dashboard-token': TOKEN,
    },
  });

  assert.equal(authorizedResponse.statusCode, 200);
});
