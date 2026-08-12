import assert from 'node:assert/strict';
import test from 'node:test';

import { AiProviderError } from '../src/services/ai-provider.js';
import { OllamaProvider } from '../src/services/ollama-provider.js';

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function abortableFetch(started: ReturnType<typeof deferred>): typeof fetch {
  return async (_input, init) => {
    started.resolve();
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('aborted', 'AbortError'));
      });
    });
  };
}

async function expectCallerCancellation(
  operation: Promise<unknown>,
): Promise<void> {
  await assert.rejects(operation, (error: unknown) => {
    assert.ok(error instanceof AiProviderError);
    assert.equal(error.code, 'AI_REQUEST_CANCELLED');
    return true;
  });
}

test('Ollama propaga cancelamento do caller atÃ© o request HTTP', async () => {
  const started = deferred();
  const controller = new AbortController();
  const provider = new OllamaProvider({ fetchImpl: abortableFetch(started) });

  const operation = provider.chatRound(
    'qwen2.5-coder:14b',
    [{ role: 'user', content: 'Revise este cÃ³digo.' }],
    {
      signal: controller.signal,
      tools: [],
      timeoutMs: 1_000,
    },
  );
  await started.promise;
  controller.abort();

  await expectCallerCancellation(operation);
});
