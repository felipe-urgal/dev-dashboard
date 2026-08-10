import assert from 'node:assert/strict';
import test from 'node:test';

import { LOG_MASK } from '@dev-dashboard/process-manager';

import type { AiProviderToolDefinition } from '../src/services/ai-provider.js';
import { OllamaProvider } from '../src/services/ollama-provider.js';

const tools: readonly AiProviderToolDefinition[] = [
  {
    name: 'search_project_text',
    description: 'Busca texto no projeto.',
    parameters: { type: 'object' },
  },
];

const messages = [{ role: 'user' as const, content: 'Analise o projeto.' }];

function options() {
  return {
    signal: new AbortController().signal,
    tools,
    timeoutMs: 1_000,
  };
}

test('mascara conteúdo antes de enviar request ao Ollama', async () => {
  const secret = 'sk-abcdefghijklmnopqrstuvwxyz123456';
  let requestBody = '';
  const fetchImpl: typeof fetch = async (_input, init) => {
    requestBody = String(init?.body ?? '');
    return new Response(
      JSON.stringify({
        message: { role: 'assistant', content: 'Concluído.' },
        done: true,
      }),
      { status: 200 },
    );
  };

  const provider = new OllamaProvider({ fetchImpl });
  await provider.chatRound(
    'qwen2.5-coder:7b',
    [{ role: 'user', content: `API_KEY=${secret}` }],
    options(),
  );

  assert.equal(requestBody.includes(secret), false);
  assert.ok(requestBody.includes(LOG_MASK));
});

test('converte tool call textual do Ollama em chamada estruturada', async () => {
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

  const provider = new OllamaProvider({ fetchImpl });
  const result = await provider.chatRound(
    'qwen2.5-coder:7b',
    messages,
    options(),
  );

  assert.equal(result.content, '');
  assert.deepEqual(result.toolCalls, [
    {
      name: 'search_project_text',
      arguments: { query: 'index de ferramentas' },
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

  const provider = new OllamaProvider({ fetchImpl });
  const result = await provider.chatRound(
    'qwen2.5-coder:7b',
    messages,
    options(),
  );

  assert.equal(result.content, leaked);
  assert.deepEqual(result.toolCalls, []);
});

test('preserva tool_calls estruturado devolvido pelo Ollama', async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response(
      JSON.stringify({
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
      }),
      { status: 200 },
    );

  const provider = new OllamaProvider({ fetchImpl });
  const result = await provider.chatRound(
    'qwen2.5-coder:7b',
    messages,
    options(),
  );

  assert.equal(result.content, '');
  assert.deepEqual(result.toolCalls, [
    {
      name: 'search_project_text',
      arguments: { query: 'index de ferramentas' },
    },
  ]);
});

test('rejeita tool call textual com argumentos inválidos', async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        message: {
          role: 'assistant',
          content: JSON.stringify({
            name: 'search_project_text',
            arguments: 'query=index',
          }),
        },
        done: true,
      }),
      { status: 200 },
    );

  const provider = new OllamaProvider({ fetchImpl });

  await assert.rejects(
    provider.chatRound('qwen2.5-coder:7b', messages, options()),
    /tool-calling do Ollama/,
  );
});
