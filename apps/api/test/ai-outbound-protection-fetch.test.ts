import assert from 'node:assert/strict';
import test from 'node:test';

import { LOG_MASK } from '@dev-dashboard/process-manager';

import {
  createAiOutboundProtectionFetch,
} from '../src/services/ai-outbound-protection-fetch.js';

function capturedFetch(
  calls: Array<{ url: string; body?: string }>,
): typeof fetch {
  return (async (input, init) => {
    calls.push({
      url: String(input),
      ...(typeof init?.body === 'string' ? { body: init.body } : {}),
    });
    return new Response('{}', { status: 200 });
  }) as typeof fetch;
}

test('mascara conteúdo textual de mensagens antes de /api/chat', async () => {
  const calls: Array<{ url: string; body?: string }> = [];
  const protectedFetch = createAiOutboundProtectionFetch(capturedFetch(calls));
  const secret = 'sk-abcdefghijklmnopqrstuvwxyz123456';

  await protectedFetch('http://127.0.0.1:11434/api/chat', {
    method: 'POST',
    body: JSON.stringify({
      model: 'qwen2.5-coder:14b',
      messages: [
        { role: 'system', content: 'Analise o projeto.' },
        { role: 'user', content: `API_KEY=${secret}` },
        {
          role: 'tool',
          tool_name: 'read_project_file',
          content: `password='segredo-local'`,
        },
      ],
      tools: [{ type: 'function', function: { name: 'read_project_file' } }],
      stream: false,
    }),
  });

  assert.equal(calls.length, 1);
  const body = JSON.parse(calls[0]?.body ?? '{}') as {
    model: string;
    messages: Array<{ content: string }>;
    tools: unknown[];
  };
  assert.equal(body.model, 'qwen2.5-coder:14b');
  assert.equal(body.tools.length, 1);
  assert.equal(body.messages[0]?.content, 'Analise o projeto.');
  assert.ok(body.messages[1]?.content.includes(LOG_MASK));
  assert.ok(body.messages[2]?.content.includes(LOG_MASK));
  assert.equal((calls[0]?.body ?? '').includes(secret), false);
  assert.equal((calls[0]?.body ?? '').includes('segredo-local'), false);
});

test('mascara prefix e suffix antes de /api/generate', async () => {
  const calls: Array<{ url: string; body?: string }> = [];
  const protectedFetch = createAiOutboundProtectionFetch(capturedFetch(calls));

  await protectedFetch('http://127.0.0.1:11434/api/generate', {
    method: 'POST',
    body: JSON.stringify({
      model: 'qwen2.5-coder:14b',
      prompt: 'const access_token = "valor-ultrassecreto";',
      suffix: 'Authorization: Bearer abcdefghijklmnopqrstuvwxyz',
      stream: false,
    }),
  });

  const body = JSON.parse(calls[0]?.body ?? '{}') as {
    prompt: string;
    suffix: string;
  };
  assert.ok(body.prompt.includes(LOG_MASK));
  assert.ok(body.suffix.includes(LOG_MASK));
  assert.equal(body.prompt.includes('valor-ultrassecreto'), false);
  assert.equal(body.suffix.includes('abcdefghijklmnopqrstuvwxyz'), false);
});

test('preserva requests que não carregam contexto textual do modelo', async () => {
  const calls: Array<{ url: string; body?: string }> = [];
  const protectedFetch = createAiOutboundProtectionFetch(capturedFetch(calls));
  const originalBody = JSON.stringify({ model: 'qwen2.5-coder:14b' });

  await protectedFetch('http://127.0.0.1:11434/api/show', {
    method: 'POST',
    body: originalBody,
  });

  assert.equal(calls[0]?.body, originalBody);
});

test('preserva corpo malformado em vez de bloquear o fetch', async () => {
  const calls: Array<{ url: string; body?: string }> = [];
  const protectedFetch = createAiOutboundProtectionFetch(capturedFetch(calls));

  await protectedFetch('http://127.0.0.1:11434/api/chat', {
    method: 'POST',
    body: '{json inválido',
  });

  assert.equal(calls[0]?.body, '{json inválido');
});
