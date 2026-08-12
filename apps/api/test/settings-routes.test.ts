import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { EnvironmentProfileRepository } from '@dev-dashboard/core';
import { buildApp } from '../src/app.js';
import { createAppContext } from '../src/app-context.js';

const token = 'a'.repeat(64);

test('cria, atualiza, lista e remove perfis de ambiente sem persistir valores sensíveis', async () => {
  const context = createAppContext();
  context.environmentProfileRepository = new EnvironmentProfileRepository(
    await mkdtemp(path.join(tmpdir(), 'api-environment-profiles-')),
  );
  const app = await buildApp({ localToken: token, context });
  const headers = { 'x-dev-dashboard-token': token };

  const unauthorized = await app.inject({
    method: 'GET',
    url: '/api/settings/environment-profiles',
  });
  assert.equal(unauthorized.statusCode, 401);

  const created = await app.inject({
    method: 'POST',
    url: '/api/settings/environment-profiles',
    headers,
    payload: {
      name: 'Staging',
      variables: [
        { name: 'API_URL', value: 'https://staging.example.com' },
        { name: 'API_SECRET_TOKEN', value: 'segredo' },
      ],
    },
  });
  assert.equal(created.statusCode, 201);
  const profile = created.json().profile;
  assert.deepEqual(profile.variables, [
    { name: 'API_URL', value: 'https://staging.example.com' },
    { name: 'API_SECRET_TOKEN' },
  ]);

  const listed = await app.inject({
    method: 'GET',
    url: '/api/settings/environment-profiles',
    headers,
  });
  assert.equal(listed.statusCode, 200);
  assert.equal(listed.json().profiles.length, 1);
  assert.equal(listed.json().limits.maxProfiles, 50);

  const updated = await app.inject({
    method: 'PUT',
    url: `/api/settings/environment-profiles/${profile.id}`,
    headers,
    payload: {
      name: 'Staging 2',
      variables: [{ name: 'PORT', value: '4000' }],
    },
  });
  assert.equal(updated.statusCode, 200);
  assert.equal(updated.json().profile.name, 'Staging 2');

  const duplicated = await app.inject({
    method: 'POST',
    url: '/api/settings/environment-profiles',
    headers,
    payload: { name: 'Staging 2', variables: [] },
  });
  assert.equal(duplicated.statusCode, 409);

  const removed = await app.inject({
    method: 'DELETE',
    url: `/api/settings/environment-profiles/${profile.id}`,
    headers,
  });
  assert.equal(removed.statusCode, 204);

  const notFound = await app.inject({
    method: 'DELETE',
    url: `/api/settings/environment-profiles/${profile.id}`,
    headers,
  });
  assert.equal(notFound.statusCode, 404);

  await app.close();
});
