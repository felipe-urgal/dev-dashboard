import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AiAssistantService,
  resolveOllamaBaseUrl,
} from '../src/services/ai-assistant-service.js';

function ndjsonResponse(chunks: unknown[], status = 200): Response {
  const body = chunks.map((chunk) => JSON.stringify(chunk)).join('\n');
  return new Response(body, { status });
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status });
}

test('status() informa indisponibilidade sem instalar nada quando o Ollama não responde', async () => {
  const service = new AiAssistantService({
    fetchImpl: async () => {
      throw new Error('conexão recusada');
    },
  });
  const status = await service.status();
  assert.equal(status.available, false);
  assert.deepEqual(status.models, []);
  assert.match(status.message, /não foi detectado/);
});

test('status() lista modelos instalados e capacidades sem baixar nada', async () => {
  const calls: string[] = [];
  const service = new AiAssistantService({
    fetchImpl: async (input) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith('/api/tags')) {
        return jsonResponse({
          models: [{ name: 'qwen2.5-coder:7b' }, { name: 'llama3.1:8b' }],
        });
      }
      if (url.endsWith('/api/show')) {
        return jsonResponse({ capabilities: ['completion', 'tools'] });
      }
      throw new Error(`chamada inesperada: ${url}`);
    },
  });
  const status = await service.status();
  assert.equal(status.available, true);
  assert.deepEqual(status.models, [
    { name: 'qwen2.5-coder:7b', capabilities: ['chat', 'tools'] },
    { name: 'llama3.1:8b', capabilities: ['chat', 'tools'] },
  ]);
  assert.ok(calls.every((url) => url.startsWith('http://127.0.0.1:11434')));
});

test('status() reporta fill-in-the-middle quando o Ollama anuncia a capacidade insert', async () => {
  const service = new AiAssistantService({
    fetchImpl: async (input) => {
      const url = String(input);
      if (url.endsWith('/api/tags')) {
        return new Response(
          JSON.stringify({ models: [{ name: 'qwen2.5-coder' }] }),
        );
      }
      if (url.endsWith('/api/show')) {
        return new Response(
          JSON.stringify({ capabilities: ['completion', 'insert'] }),
        );
      }
      throw new Error(`chamada inesperada: ${url}`);
    },
  });
  const status = await service.status();
  assert.deepEqual(status.models, [
    { name: 'qwen2.5-coder', capabilities: ['chat', 'fill-in-the-middle'] },
  ]);
});

test('review() envia contexto fechado ao Ollama sem ferramentas', async () => {
  let requestBody: Record<string, unknown> | null = null;
  const service = new AiAssistantService({
    fetchImpl: async (_input, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return ndjsonResponse([
        {
          message: {
            role: 'assistant',
            content: '{"summary":"Sem achados","findings":[]}',
          },
          done: true,
        },
      ]);
    },
  });

  const response = await service.review(
    'llama3.1',
    [
      { role: 'system', content: 'Revise somente o diff.' },
      { role: 'user', content: 'DIFF: + const ok = true;' },
    ],
    new AbortController().signal,
  );

  assert.equal(response, '{"summary":"Sem achados","findings":[]}');
  assert.ok(requestBody);
  assert.equal('tools' in requestBody, false);
  assert.equal('format' in requestBody, false);
  assert.deepEqual(requestBody.options, {
    num_predict: 700,
    temperature: 0.1,
  });
});

test('review() não agenda timeout automático', async () => {
  const scheduledTimeouts: number[] = [];
  const originalSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = ((...args: Parameters<typeof setTimeout>) => {
    scheduledTimeouts.push(Number(args[1]));
    return 0 as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout;

  try {
    const service = new AiAssistantService({
      fetchImpl: async () =>
        ndjsonResponse([
          {
            message: {
              role: 'assistant',
              content: '{"summary":"Sem achados","findings":[]}',
            },
            done: true,
          },
        ]),
    });

    await service.review(
      'qwen2.5-coder:7b',
      [{ role: 'user', content: 'Revise este diff.' }],
      new AbortController().signal,
    );

    assert.deepEqual(scheduledTimeouts, []);
  } finally {
    globalThis.setTimeout = originalSetTimeout;
  }
});

test('review() recusa modelo vazio sem chamar o Ollama', async () => {
  const service = new AiAssistantService({
    fetchImpl: async () => {
      throw new Error('não deveria chamar o Ollama');
    },
  });
  await assert.rejects(
    () =>
      service.review(
        '',
        [{ role: 'user', content: 'Revise.' }],
        new AbortController().signal,
      ),
    /Selecione um modelo/,
  );
});

test('review() propaga cancelamento como erro claro', async () => {
  const controller = new AbortController();
  const service = new AiAssistantService({
    fetchImpl: async () => {
      controller.abort();
      throw new DOMException('aborted', 'AbortError');
    },
  });
  await assert.rejects(
    () =>
      service.review(
        'llama3.1',
        [{ role: 'user', content: 'Revise.' }],
        controller.signal,
      ),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /cancelada/);
      return true;
    },
  );
});

test('resolveOllamaBaseUrl() aceita loopback IPv4/IPv6 e recusa hosts remotos', () => {
  const previous = process.env.DEV_DASHBOARD_OLLAMA_URL;
  try {
    delete process.env.DEV_DASHBOARD_OLLAMA_URL;
    assert.equal(resolveOllamaBaseUrl(), 'http://127.0.0.1:11434');

    process.env.DEV_DASHBOARD_OLLAMA_URL = 'http://127.0.0.1:9999';
    assert.equal(resolveOllamaBaseUrl(), 'http://127.0.0.1:9999');

    process.env.DEV_DASHBOARD_OLLAMA_URL = 'http://[::1]:11434';
    assert.equal(resolveOllamaBaseUrl(), 'http://[::1]:11434');

    process.env.DEV_DASHBOARD_OLLAMA_URL = 'http://localhost:11434';
    assert.equal(resolveOllamaBaseUrl(), 'http://localhost:11434');

    process.env.DEV_DASHBOARD_OLLAMA_URL = 'http://example.com:11434';
    assert.equal(resolveOllamaBaseUrl(), undefined);

    process.env.DEV_DASHBOARD_OLLAMA_URL = 'https://127.0.0.1:11434';
    assert.equal(resolveOllamaBaseUrl(), undefined);

    process.env.DEV_DASHBOARD_OLLAMA_URL = 'não é uma url';
    assert.equal(resolveOllamaBaseUrl(), undefined);
  } finally {
    if (previous === undefined) delete process.env.DEV_DASHBOARD_OLLAMA_URL;
    else process.env.DEV_DASHBOARD_OLLAMA_URL = previous;
  }
});
