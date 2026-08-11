import assert from 'node:assert/strict';
import test from 'node:test';

import { buildApp } from '../src/app.js';
import { createAppContext } from '../src/app-context.js';

test('shutdown da API fecha implementation e Code Review de IA', async () => {
  const context = createAppContext();
  let implementationCloseCalls = 0;
  let codeReviewCloseCalls = 0;

  context.aiImplementationExecutionService.close = () => {
    implementationCloseCalls += 1;
  };
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

  assert.equal(implementationCloseCalls, 1);
  assert.equal(codeReviewCloseCalls, 1);
});
