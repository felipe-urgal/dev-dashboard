import assert from 'node:assert/strict';

import { test } from 'node:test';

import Fastify from 'fastify';

import { ApiError, registerApiErrorHandling } from '../src/http/api-error.js';

async function buildTestApp() {
  const app = Fastify({
    logger: false,
  });

  registerApiErrorHandling(app);

  app.get('/api/conflict', async () => {
    throw new ApiError({
      statusCode: 409,
      code: 'CONFLICT',
      message: 'O recurso já existe.',
    });
  });

  app.post(
    '/api/validated',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['name'],
          properties: {
            name: {
              type: 'string',
              minLength: 1,
            },
          },
        },
      },
    },
    async () => ({
      ok: true,
    }),
  );

  app.post('/api/json', async () => ({
    ok: true,
  }));

  app.get('/api/unexpected', async () => {
    throw new Error('Mensagem interna sensível.');
  });

  return app;
}

test('returns a standardized not found response', async (context) => {
  const app = await buildTestApp();

  context.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: 'GET',
    url: '/api/missing',
  });

  assert.equal(response.statusCode, 404);

  assert.deepEqual(response.json(), {
    error: 'NOT_FOUND',
    message: 'Endpoint não encontrado.',
  });
});

test('returns an explicit API error', async (context) => {
  const app = await buildTestApp();

  context.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: 'GET',
    url: '/api/conflict',
  });

  assert.equal(response.statusCode, 409);

  assert.deepEqual(response.json(), {
    error: 'CONFLICT',
    message: 'O recurso já existe.',
  });
});

test('returns validation details without a stack trace', async (context) => {
  const app = await buildTestApp();

  context.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: 'POST',
    url: '/api/validated',
    payload: {},
  });

  const body = response.json();

  assert.equal(response.statusCode, 400);
  assert.equal(body.error, 'VALIDATION_ERROR');

  assert.equal(Array.isArray(body.details), true);

  assert.equal('stack' in body, false);
});

test('preserves client status for malformed JSON', async (context) => {
  const app = await buildTestApp();

  context.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: 'POST',
    url: '/api/json',
    headers: {
      'content-type': 'application/json',
    },
    payload: '{"name":',
  });

  assert.equal(response.statusCode, 400);

  assert.deepEqual(response.json(), {
    error: 'BAD_REQUEST',
    message: 'A requisição não pôde ser processada.',
  });
});

test('hides unexpected internal error messages', async (context) => {
  const app = await buildTestApp();

  context.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: 'GET',
    url: '/api/unexpected',
  });

  const body = response.json();

  assert.equal(response.statusCode, 500);

  assert.deepEqual(body, {
    error: 'INTERNAL_ERROR',
    message: 'Não foi possível concluir a operação.',
  });

  assert.equal(response.body.includes('Mensagem interna sensível'), false);
});
