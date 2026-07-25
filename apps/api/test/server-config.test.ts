import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { parseApiPort, readServerConfig, resolveWebDist } from '../src/server-config.js';

test('porta usa default e rejeita valores parciais ou fora da faixa', () => {
  assert.equal(parseApiPort(undefined), 4343);
  assert.equal(parseApiPort('5432'), 5432);
  for (const value of ['12x', '0', '65536', '-1']) assert.throws(() => parseApiPort(value), /inválida/);
});

test('diretório estático é absoluto mesmo antes de existir', async () => {
  assert.equal(await resolveWebDist('apps/web/dist', '/repo'), path.resolve('/repo/apps/web/dist'));
});

test('configuração mantém host fixo e exige diretório no modo local', async () => {
  await assert.rejects(readServerConfig({ DEV_DASHBOARD_LOCAL_DISTRIBUTION: '1' }, '/repo'), /WEB_DIST/);
  const config = await readServerConfig({ DEV_DASHBOARD_API_PORT: '5000' }, '/repo');
  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.localOrigin, 'http://127.0.0.1:5000');
  assert.equal(config.staticDashboardEnabled, false);
});
