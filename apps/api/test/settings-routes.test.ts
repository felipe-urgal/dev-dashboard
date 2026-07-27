import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { RetentionSettingsRepository } from '@dev-dashboard/core';
import { buildApp } from '../src/app.js';
import { createAppContext } from '../src/app-context.js';

const token = 'a'.repeat(64);

test('consulta e atualiza retenção somente com autenticação e schema fechado', async () => {
  const context = createAppContext();
  context.retentionSettingsRepository = new RetentionSettingsRepository(await mkdtemp(path.join(tmpdir(), 'api-retention-')));
  const app = await buildApp({ localToken: token, context });
  const unauthorized = await app.inject({ method: 'GET', url: '/api/settings/retention' });
  assert.equal(unauthorized.statusCode, 401);
  const response = await app.inject({ method: 'PUT', url: '/api/settings/retention', headers: { 'x-dev-dashboard-token': token }, payload: { retentionDays: 30, scriptHistoryLimit: 300, testHistoryLimit: 100 } });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json().values, { retentionDays: 30, scriptHistoryLimit: 300, testHistoryLimit: 100 });
  assert.equal(response.json().appliesAfterRestart, true);
  const invalid = await app.inject({ method: 'PUT', url: '/api/settings/retention', headers: { 'x-dev-dashboard-token': token }, payload: { retentionDays: 0, scriptHistoryLimit: 300, testHistoryLimit: 100, path: '/tmp' } });
  assert.equal(invalid.statusCode, 400);
  await app.close();
});
