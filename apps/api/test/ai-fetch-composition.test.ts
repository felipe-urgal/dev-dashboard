import assert from 'node:assert/strict';
import test from 'node:test';

import { LOG_MASK } from '@dev-dashboard/process-manager';

import { createAiOutboundProtectionFetch } from '../src/services/ai-outbound-protection-fetch.js';
import { createOllamaToolCallCompatFetch } from '../src/services/ollama-tool-call-compat-fetch.js';

test('proteção de saída preserva a conversão de tool call textual do Ollama', async () => {
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
  const fetchImpl = createOllamaToolCallCompatFetch(
    createAiOutboundProtectionFetch(rawFetch),
  );

  const response = await fetchImpl('http://127.0.0.1:11434/api/chat', {
    method: 'POST',
    body: JSON.stringify({
      model: 'qwen2.5-coder:7b',
      messages: [
        {
          role: 'user',
          content: 'API_KEY=sk-abcdefghijklmnopqrstuvwxyz123456',
        },
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'search_project_text',
            parameters: { type: 'object' },
          },
        },
      ],
      stream: false,
    }),
  });
  const payload = (await response.json()) as {
    message: {
      content: string;
      tool_calls: Array<{
        function: { name: string; arguments: Record<string, unknown> };
      }>;
    };
  };

  assert.ok(outboundBody.includes(LOG_MASK));
  assert.equal(outboundBody.includes('abcdefghijklmnopqrstuvwxyz123456'), false);
  assert.equal(payload.message.content, '');
  assert.deepEqual(payload.message.tool_calls, [
    {
      function: {
        name: 'search_project_text',
        arguments: { query: 'configuração' },
      },
    },
  ]);
});
