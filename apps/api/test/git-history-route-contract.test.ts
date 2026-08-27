import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildApp } from '../src/app.js';

const TOKEN = 'h'.repeat(64);

test('mantém os contratos de histórico Git', async (context) => {
  const app = await buildApp({ localToken: TOKEN });
  context.after(async () => app.close());

  await app.ready();

  assert.equal(
    app.hasRoute({
      method: 'GET',
      url: '/api/projects/:projectId/git/current-branch-commits',
    }),
    true,
  );
  assert.equal(
    app.hasRoute({
      method: 'GET',
      url: '/api/projects/:projectId/git/exclusive-branch-commits',
    }),
    true,
  );
});
