import assert from 'node:assert/strict';
import test from 'node:test';

import { createOllamaToolCallCompatFetch } from '../src/services/ollama-tool-call-compat-fetch.js';

function toolRequestBody(): string {
  return JSON.stringify({
    model: 'qwen2.5-coder:7b',
    messages: [{ role: 'user', content: 'Analise o projeto.' }],
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
  });
}

test('converte tool call textual em tool_calls estruturado', async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        message: {
          role: 'assistant',
          content: JSON.stringify({
            name: 'search_project_text',
            arguments: { query: 'index de ferramentas' },
          }),
        },
        done: true,
      }),
      { status: 200 },
    );

  const compatFetch = createOllamaToolCallCompatFetch(fetchImpl);
  const response = await compatFetch('http://127.0.0.1:11434/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: toolRequestBody(),
  });
  const payload = (await response.json()) as {
    message: {
      content: string;
      tool_calls: Array<{
        function: { name: string; arguments: Record<string, unknown> };
      }>;
    };
  };

  assert.equal(payload.message.content, '');
  assert.deepEqual(payload.message.tool_calls, [
    {
      function: {
        name: 'search_project_text',
        arguments: { query: 'index de ferramentas' },
      },
    },
  ]);
});

test('não converte chamada textual para ferramenta fora do catálogo enviado', async () => {
  const leaked = JSON.stringify({
    name: 'delete_project',
    arguments: { path: 'src' },
  });
  const fetchImpl: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        message: { role: 'assistant', content: leaked },
        done: true,
      }),
      { status: 200 },
    );

  const compatFetch = createOllamaToolCallCompatFetch(fetchImpl);
  const response = await compatFetch('http://127.0.0.1:11434/api/chat', {
    method: 'POST',
    body: toolRequestBody(),
  });
  const payload = (await response.json()) as {
    message: { content: string; tool_calls?: unknown };
  };

  assert.equal(payload.message.content, leaked);
  assert.equal(payload.message.tool_calls, undefined);
});

test('preserva resposta que já usa tool_calls estruturado', async () => {
  const structured = {
    message: {
      role: 'assistant',
      content: '',
      tool_calls: [
        {
          function: {
            name: 'search_project_text',
            arguments: { query: 'index de ferramentas' },
          },
        },
      ],
    },
    done: true,
  };
  const fetchImpl: typeof fetch = async () =>
    new Response(JSON.stringify(structured), { status: 200 });

  const compatFetch = createOllamaToolCallCompatFetch(fetchImpl);
  const response = await compatFetch('http://127.0.0.1:11434/api/chat', {
    method: 'POST',
    body: toolRequestBody(),
  });

  assert.deepEqual(await response.json(), structured);
});
