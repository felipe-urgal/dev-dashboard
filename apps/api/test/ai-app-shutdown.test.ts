import assert from 'node:assert/strict';
import test from 'node:test';

import { buildApp } from '../src/app.js';
import { createAppContext } from '../src/app-context.js';

test('shutdown da API fecha o Code Review de IA', async () => {
  const context = createAppContext();
  let codeReviewCloseCalls = 0;

  context.gitAiCodeReviewService.close = () => {
    codeReviewCloseCalls += 1;
  };

  const app = await buildApp({
    context,
    localToken: 'test-local-token',
    allowedOrigins: ['http://127.0.0.1:5173'],
  });
  await app.ready();
  await app.close();

  assert.equal(codeReviewCloseCalls, 1);
});
