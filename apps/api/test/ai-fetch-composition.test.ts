import assert from 'node:assert/strict';
import test from 'node:test';

import { LOG_MASK } from '@dev-dashboard/process-manager';

import { OllamaProvider } from '../src/services/ollama-provider.js';

test('OllamaProvider compõe proteção de saída e compatibilidade de tool call textual', async () => {
  let outboundBody = '';
  const rawFetch: typeof fetch = async (_input, init) => {
    outboundBody = String(init?.body ?? '');
    return new Response(
      JSON.stringify({
        message: {
          role: 'assistant',
          content: JSON.stringify({
            name: 'search_project_text',
            arguments: { query: 'configuração' },
          }),
        },
        done: true,
      }),
      { status: 200 },
    );
  };
  const provider = new OllamaProvider({ fetchImpl: rawFetch });

  const result = await provider.chatRound(
    'qwen2.5-coder:7b',
    [
      {
        role: 'user',
        content: 'API_KEY=sk-abcdefghijklmnopqrstuvwxyz123456',
      },
    ],
    {
      signal: new AbortController().signal,
      timeoutMs: 1_000,
      tools: [
        {
          name: 'search_project_text',
          description: 'Busca texto no projeto.',
          parameters: { type: 'object' },
        },
      ],
    },
  );

  assert.ok(outboundBody.includes(LOG_MASK));
  assert.equal(
    outboundBody.includes('abcdefghijklmnopqrstuvwxyz123456'),
    false,
  );
  assert.equal(result.content, '');
  assert.deepEqual(result.toolCalls, [
    {
      name: 'search_project_text',
      arguments: { query: 'configuração' },
    },
  ]);
});
