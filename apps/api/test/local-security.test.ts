import assert from 'node:assert/strict';

import { test } from 'node:test';

import Fastify from 'fastify';

import {
  BROWSER_BOOTSTRAP_HEADER,
  LOCAL_TOKEN_HEADER,
  registerLocalSecurity,
} from '../src/security/local-security.js';

const TOKEN = 'a'.repeat(64);
const BOOTSTRAP_TOKEN = 'b'.repeat(64);
const ALLOWED_ORIGIN = 'http://127.0.0.1:5173';

async function buildTestApp() {
  const app = Fastify({
    logger: false,
  });

  await registerLocalSecurity(app, {
    token: TOKEN,
    browserBootstrapToken: BOOTSTRAP_TOKEN,
  });

  app.get('/api/health', async () => ({
    status: 'ok',
  }));

  app.get('/api/private', async () => ({
    protected: true,
  }));

  return app;
}

test('allows the public health endpoint without a token', async (context) => {
  const app = await buildTestApp();

  context.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: 'GET',
    url: '/api/health',
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    status: 'ok',
  });
});

test('rejects a protected endpoint without a token', async (context) => {
  const app = await buildTestApp();

  context.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: 'GET',
    url: '/api/private',
  });

  assert.equal(response.statusCode, 401);
  assert.equal(response.json().error, 'INVALID_LOCAL_TOKEN');
});

test('accepts the correct token without an Origin header', async (context) => {
  const app = await buildTestApp();

  context.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: 'GET',
    url: '/api/private',
    headers: {
      [LOCAL_TOKEN_HEADER]: TOKEN,
    },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    protected: true,
  });
});

test('rejects an unauthorized browser origin', async (context) => {
  const app = await buildTestApp();

  context.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: 'GET',
    url: '/api/private',
    headers: {
      origin: 'https://example.com',
      [LOCAL_TOKEN_HEADER]: TOKEN,
    },
  });

  assert.equal(response.statusCode, 403);
  assert.equal(response.json().error, 'ORIGIN_NOT_ALLOWED');

  assert.equal(response.headers['access-control-allow-origin'], undefined);
});

test('allows the dashboard origin and returns CORS headers', async (context) => {
  const app = await buildTestApp();

  context.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: 'GET',
    url: '/api/private',
    headers: {
      origin: ALLOWED_ORIGIN,
      [LOCAL_TOKEN_HEADER]: TOKEN,
    },
  });

  assert.equal(response.statusCode, 200);

  assert.equal(response.headers['access-control-allow-origin'], ALLOWED_ORIGIN);
});

test('answers an allowed CORS preflight', async (context) => {
  const app = await buildTestApp();

  context.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: 'OPTIONS',
    url: '/api/private',
    headers: {
      origin: ALLOWED_ORIGIN,
      'access-control-request-method': 'GET',
      'access-control-request-headers': 'x-dev-dashboard-token',
    },
  });

  assert.equal(response.statusCode, 204);

  assert.equal(response.headers['access-control-allow-origin'], ALLOWED_ORIGIN);

  assert.match(
    String(response.headers['access-control-allow-headers']).toLowerCase(),
    /x-dev-dashboard-token/,
  );
});

test('allows preview origin and PUT preflight for server settings', async (context) => {
  const app = await buildTestApp();

  context.after(async () => {
    await app.close();
  });

  const previewOrigin = 'http://127.0.0.1:4173';

  const response = await app.inject({
    method: 'OPTIONS',
    url: '/api/private',
    headers: {
      origin: previewOrigin,
      'access-control-request-method': 'PUT',
      'access-control-request-headers': 'content-type,x-dev-dashboard-token',
    },
  });

  assert.equal(response.statusCode, 204);
  assert.equal(response.headers['access-control-allow-origin'], previewOrigin);
  assert.match(String(response.headers['access-control-allow-methods']), /PUT/);
});

test('bootstrap exige capacidade e origem exata antes de autenticar por cookie HttpOnly', async (context) => {
  const app = await buildTestApp();
  context.after(async () => app.close());
  const unauthenticated = await app.inject({
    method: 'POST',
    url: '/api/auth/browser-session',
    headers: {
      origin: 'http://127.0.0.1:4343',
      'content-type': 'application/json',
    },
    payload: {},
  });
  assert.equal(unauthenticated.statusCode, 401);
  assert.equal(unauthenticated.json().error, 'INVALID_BROWSER_BOOTSTRAP');
  const denied = await app.inject({
    method: 'POST',
    url: '/api/auth/browser-session',
    headers: {
      origin: 'https://example.com',
      'content-type': 'application/json',
      [BROWSER_BOOTSTRAP_HEADER]: BOOTSTRAP_TOKEN,
    },
    payload: {},
  });
  assert.equal(denied.statusCode, 403);
  const bootstrap = await app.inject({
    method: 'POST',
    url: '/api/auth/browser-session',
    headers: {
      origin: 'http://127.0.0.1:4343',
      'content-type': 'application/json',
      [BROWSER_BOOTSTRAP_HEADER]: BOOTSTRAP_TOKEN,
    },
    payload: {},
  });
  assert.equal(bootstrap.statusCode, 204);
  const cookie = String(bootstrap.headers['set-cookie']).split(';')[0];
  assert.match(
    String(bootstrap.headers['set-cookie']),
    /HttpOnly.*SameSite=Strict/,
  );
  assert.equal(
    (await app.inject({ url: '/api/private', headers: { cookie } })).statusCode,
    200,
  );
});

test('cookie não autoriza mutação sem Origin e sessão expirada pode ser renovada', async (context) => {
  let current = 1000;
  const app = Fastify({ logger: false });
  await registerLocalSecurity(app, {
    token: TOKEN,
    browserBootstrapToken: BOOTSTRAP_TOKEN,
    localOrigin: 'http://127.0.0.1:4343',
    sessionTtlSeconds: 10,
    now: () => current,
  });
  app.post('/api/private', async () => ({ ok: true }));
  app.get('/api/private', async () => ({ ok: true }));
  context.after(async () => app.close());
  const create = () =>
    app.inject({
      method: 'POST',
      url: '/api/auth/browser-session',
      headers: {
        origin: 'http://127.0.0.1:4343',
        'content-type': 'application/json',
        [BROWSER_BOOTSTRAP_HEADER]: BOOTSTRAP_TOKEN,
      },
      payload: {},
    });
  let cookie = String((await create()).headers['set-cookie']).split(';')[0];
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: '/api/private',
        headers: { cookie },
      })
    ).statusCode,
    403,
  );
  current = 1011;
  const expired = await app.inject({
    url: '/api/private',
    headers: { cookie },
  });
  assert.equal(expired.statusCode, 401);
  assert.equal(expired.json().error, 'SESSION_EXPIRED');
  cookie = String((await create()).headers['set-cookie']).split(';')[0];
  assert.equal(
    (await app.inject({ url: '/api/private', headers: { cookie } })).statusCode,
    200,
  );
});

test('origem da distribuição entra na allowlist e autoriza mutação com cookie', async (context) => {
  const distributedOrigin = 'http://127.0.0.1:54321';
  const app = Fastify({ logger: false });
  await registerLocalSecurity(app, {
    token: TOKEN,
    browserBootstrapToken: BOOTSTRAP_TOKEN,
    localOrigin: distributedOrigin,
  });
  app.post('/api/private', async () => ({ ok: true }));
  context.after(async () => app.close());

  const bootstrap = await app.inject({
    method: 'POST',
    url: '/api/auth/browser-session',
    headers: {
      origin: distributedOrigin,
      'content-type': 'application/json',
      [BROWSER_BOOTSTRAP_HEADER]: BOOTSTRAP_TOKEN,
    },
    payload: {},
  });
  const cookie = String(bootstrap.headers['set-cookie']).split(';')[0];
  const mutation = await app.inject({
    method: 'POST',
    url: '/api/private',
    headers: { cookie, origin: distributedOrigin },
  });

  assert.equal(bootstrap.statusCode, 204);
  assert.equal(mutation.statusCode, 200);
  assert.equal(
    mutation.headers['access-control-allow-origin'],
    distributedOrigin,
  );
});
