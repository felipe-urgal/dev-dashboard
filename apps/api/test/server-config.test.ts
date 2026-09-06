import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import {
  parseApiPort,
  parseLocalOrigin,
  readServerConfig,
  resolveWebDist,
} from '../src/server-config.js';

test('porta usa default e rejeita valores parciais ou fora da faixa', () => {
  assert.equal(parseApiPort(undefined), 4343);
  assert.equal(parseApiPort('5432'), 5432);
  for (const value of ['12x', '0', '65536', '-1'])
    assert.throws(() => parseApiPort(value), /inválida/);
});

test('origem local aceita apenas HTTP local na mesma porta da API', () => {
  assert.equal(
    parseLocalOrigin(undefined, 4343),
    'http://127.0.0.1:4343',
  );
  assert.equal(
    parseLocalOrigin('http://dev-dashboard.localhost:4343', 4343),
    'http://dev-dashboard.localhost:4343',
  );
  assert.equal(
    parseLocalOrigin('http://localhost:4343/', 4343),
    'http://localhost:4343',
  );
  assert.equal(
    parseLocalOrigin('http://dev-dashboard.localhost', 80),
    'http://dev-dashboard.localhost',
  );

  for (const value of [
    'https://dev-dashboard.localhost:4343',
    'http://example.com:4343',
    'http://dev-dashboard.localhost:5000',
    'http://dev-dashboard.localhost:4343/admin',
    'http://user:pass@dev-dashboard.localhost:4343',
    'http://dev-dashboard.localhost:4343?x=1',
    'http://dev-dashboard.localhost:4343/#token',
  ]) {
    assert.throws(() => parseLocalOrigin(value, 4343), /LOCAL_ORIGIN/);
  }
});

test('diretório estático é absoluto mesmo antes de existir', async () => {
  assert.equal(
    await resolveWebDist('apps/web/dist', '/repo'),
    path.resolve('/repo/apps/web/dist'),
  );
});

test('configuração mantém host fixo e exige diretório no modo local', async () => {
  await assert.rejects(
    readServerConfig({ DEV_DASHBOARD_LOCAL_DISTRIBUTION: '1' }, '/repo'),
    /WEB_DIST/,
  );
  await assert.rejects(
    readServerConfig(
      { DEV_DASHBOARD_LOCAL_DISTRIBUTION: '1', DEV_DASHBOARD_WEB_DIST: 'dist' },
      '/repo',
    ),
    /BROWSER_BOOTSTRAP/,
  );
  await assert.rejects(
    readServerConfig({ DEV_DASHBOARD_BROWSER_BOOTSTRAP: 'fraco' }, '/repo'),
    /64 caracteres/,
  );
  const config = await readServerConfig(
    {
      DEV_DASHBOARD_API_PORT: '5000',
      DEV_DASHBOARD_LOCAL_ORIGIN: 'http://dev-dashboard.localhost:5000',
    },
    '/repo',
  );
  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.localOrigin, 'http://dev-dashboard.localhost:5000');
  assert.equal(config.staticDashboardEnabled, false);
});
