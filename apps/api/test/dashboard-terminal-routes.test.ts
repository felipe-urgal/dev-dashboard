import assert from 'node:assert/strict';
import test from 'node:test';

const TOKEN = 't'.repeat(64);

test('confirmação do modo terminal exige autenticação e retorna token', async (context) => {
  const { buildApp } = await import('../src/app.js');
  const app = await buildApp({ localToken: TOKEN });
  context.after(async () => app.close());

  const unauthorized = await app.inject({
    method: 'POST',
    url: '/api/dashboard/terminal/confirmations',
    payload: {},
    headers: { 'content-type': 'application/json' },
  });
  assert.equal(unauthorized.statusCode, 401);

  const authorized = await app.inject({
    method: 'POST',
    url: '/api/dashboard/terminal/confirmations',
    payload: {},
    headers: {
      'x-dev-dashboard-token': TOKEN,
      'content-type': 'application/json',
    },
  });
  assert.equal(authorized.statusCode, 201);
  const body = authorized.json<{
    confirmation: { token: string; expiresAt: string };
  }>();
  assert.equal(body.confirmation.token.length, 64);
  assert.ok(body.confirmation.expiresAt);
});
