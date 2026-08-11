import assert from 'node:assert/strict';
import test from 'node:test';

import { LOG_MASK } from '@dev-dashboard/process-manager';

import type { AiModelPullStreamEvent } from '@dev-dashboard/contracts';

import type { AiProviderToolDefinition } from '../src/services/ai-provider.js';
import { OllamaProvider } from '../src/services/ollama-provider.js';

const encoder = new TextEncoder();

function ndjsonStream(lines: readonly string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(line));
      controller.close();
    },
  });
}

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

test('status reporta indisponível quando o Ollama está offline', async () => {
  const fetchImpl: typeof fetch = async () => {
    throw new TypeError('fetch failed');
  };

  const provider = new OllamaProvider({ fetchImpl });
  const status = await provider.status();

  assert.equal(status.available, false);
  assert.equal(status.errorCode, 'AI_PROVIDER_UNAVAILABLE');
  assert.equal(status.models.length, 0);
});

test('chatRound falha com erro de request quando o Ollama está offline', async () => {
  const fetchImpl: typeof fetch = async () => {
    throw new TypeError('fetch failed');
  };

  const provider = new OllamaProvider({ fetchImpl });

  await assert.rejects(
    provider.chatRound('qwen2.5-coder:7b', messages, options()),
    (error: unknown) =>
      error instanceof Error &&
      'code' in error &&
      (error as { code: unknown }).code === 'AI_PROVIDER_REQUEST_FAILED',
  );
});

test('status reporta Ollama disponível sem nenhum modelo instalado', async () => {
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    if (url.endsWith('/api/tags')) {
      return new Response(JSON.stringify({ models: [] }), { status: 200 });
    }
    throw new Error(`endpoint inesperado: ${url}`);
  };

  const provider = new OllamaProvider({ fetchImpl });
  const status = await provider.status();

  assert.equal(status.available, true);
  assert.deepEqual(status.models, []);
  assert.match(status.message ?? '', /nenhum modelo está instalado/);
});

test('chatRound falha de forma previsível quando o modelo foi removido no meio do uso', async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response(
      JSON.stringify({ error: 'model "qwen2.5-coder:7b" not found' }),
      { status: 404 },
    );

  const provider = new OllamaProvider({ fetchImpl });

  await assert.rejects(
    provider.chatRound('qwen2.5-coder:7b', messages, options()),
    (error: unknown) =>
      error instanceof Error &&
      'code' in error &&
      (error as { code: unknown }).code === 'AI_PROVIDER_REQUEST_FAILED' &&
      /404/.test(error.message),
  );
});

test('chatRound rejeita quando o NDJSON do Ollama chega incompleto', async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response(
      ndjsonStream([
        `${JSON.stringify({ message: { role: 'assistant', content: 'Olá' } })}\n`,
        '{"message":{"role":"assistant","content":"trunc',
      ]),
      { status: 200 },
    );

  const provider = new OllamaProvider({ fetchImpl });

  await assert.rejects(
    provider.chatRound('qwen2.5-coder:7b', messages, options()),
    /não pôde ser interpretad[oa]/,
  );
});

test('cancela a instalação de um modelo em download longo sem lançar erro', async () => {
  const events: AiModelPullStreamEvent[] = [];
  const fetchImpl: typeof fetch = async (_input, init) => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            `${JSON.stringify({ status: 'baixando modelo', completed: 1, total: 100 })}\n`,
          ),
        );
        init?.signal?.addEventListener('abort', () => {
          controller.error(new DOMException('Aborted', 'AbortError'));
        });
      },
    });
    return new Response(stream, { status: 200 });
  };

  const provider = new OllamaProvider({ fetchImpl });
  const controller = new AbortController();

  const install = provider.installModel('qwen2.5-coder:7b', {
    send: (event) => events.push(event),
    signal: controller.signal,
  });

  await new Promise((resolve) => setTimeout(resolve, 10));
  controller.abort();

  await assert.doesNotReject(install);
  assert.ok(events.some((event) => event.type === 'progress'));
  assert.ok(!events.some((event) => event.type === 'done'));
});
