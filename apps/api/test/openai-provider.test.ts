import assert from 'node:assert/strict';
import test from 'node:test';

import { LOG_MASK } from '@dev-dashboard/process-manager';

import type {
  AiProviderMessage,
  AiProviderToolDefinition,
} from '../src/services/ai-provider.js';
import { OpenAiProvider } from '../src/services/openai-provider.js';

const tools: readonly AiProviderToolDefinition[] = [
  {
    name: 'search_project_text',
    description: 'Busca texto no projeto.',
    parameters: {
      type: 'object',
      required: ['query'],
      properties: { query: { type: 'string' } },
    },
  },
];

function roundOptions() {
  return {
    signal: new AbortController().signal,
    tools,
    timeoutMs: 1_000,
    maxOutputTokens: 256,
  };
}

test('status fica indisponível sem API key e não faz request', async () => {
  let calls = 0;
  const provider = new OpenAiProvider({
    apiKey: '   ',
    fetchImpl: async () => {
      calls += 1;
      throw new Error('não deveria chamar fetch');
    },
  });

  const status = await provider.status();

  assert.equal(status.available, false);
  assert.equal(status.models.length, 0);
  assert.equal(calls, 0);
  assert.match(status.message, /API_KEY/);
});

test('status lista somente modelos compatíveis e autentica por Bearer', async () => {
  let authorization = '';
  const provider = new OpenAiProvider({
    apiKey: 'test-openai-key',
    fetchImpl: async (_input, init) => {
      authorization = new Headers(init?.headers).get('authorization') ?? '';
      return new Response(
        JSON.stringify({
          data: [
            { id: 'gpt-5.4-mini' },
            { id: 'gpt-5.4-pro' },
            { id: 'gpt-5.3-codex' },
            { id: 'text-embedding-3-small' },
            { id: 'gpt-4.1' },
          ],
        }),
        { status: 200 },
      );
    },
  });

  const status = await provider.status();

  assert.equal(status.available, true);
  assert.equal(authorization, 'Bearer test-openai-key');
  assert.deepEqual(
    status.models.map((model) => model.name),
    ['gpt-4.1', 'gpt-5.4-mini'],
  );
  assert.deepEqual(status.models[0]?.capabilities, ['chat', 'tools']);
});

test('chat mascara conteúdo e não solicita persistência na OpenAI', async () => {
  const secret = 'sk-abcdefghijklmnopqrstuvwxyz123456';
  let requestBody = '';
  const provider = new OpenAiProvider({
    apiKey: 'test-openai-key',
    fetchImpl: async (_input, init) => {
      requestBody = String(init?.body ?? '');
      return new Response(
        JSON.stringify({
          choices: [{ message: { role: 'assistant', content: 'Concluído.' } }],
        }),
        { status: 200 },
      );
    },
  });

  const result = await provider.chatRound(
    'gpt-5.4-mini',
    [{ role: 'user', content: `API_KEY=${secret}` }],
    roundOptions(),
  );

  assert.equal(result.content, 'Concluído.');
  assert.equal(requestBody.includes(secret), false);
  assert.ok(requestBody.includes(LOG_MASK));
  const body = JSON.parse(requestBody) as Record<string, unknown>;
  assert.equal(body.store, false);
});

test('mantém call id nativo dentro do provider entre rodadas de ferramenta', async () => {
  const requestBodies: string[] = [];
  let call = 0;
  const provider = new OpenAiProvider({
    apiKey: 'test-openai-key',
    fetchImpl: async (_input, init) => {
      requestBodies.push(String(init?.body ?? ''));
      call += 1;
      if (call === 1) {
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  role: 'assistant',
                  content: null,
                  tool_calls: [
                    {
                      id: 'call_search_1',
                      type: 'function',
                      function: {
                        name: 'search_project_text',
                        arguments: JSON.stringify({ query: 'provider' }),
                      },
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          choices: [{ message: { role: 'assistant', content: 'Achei.' } }],
        }),
        { status: 200 },
      );
    },
  });
  const messages: AiProviderMessage[] = [
    { role: 'user', content: 'Procure provider.' },
  ];

  const first = await provider.chatRound(
    'gpt-5.4-mini',
    messages,
    roundOptions(),
  );
  assert.deepEqual(first.toolCalls, [
    {
      name: 'search_project_text',
      arguments: { query: 'provider' },
    },
  ]);

  messages.push({
    role: 'tool',
    toolName: 'search_project_text',
    content: JSON.stringify({ matches: ['src/provider.ts'] }),
  });
  const second = await provider.chatRound(
    'gpt-5.4-mini',
    messages,
    roundOptions(),
  );

  assert.equal(second.content, 'Achei.');
  const secondBody = JSON.parse(requestBodies[1] ?? '{}') as {
    messages?: Array<Record<string, unknown>>;
  };
  const assistant = secondBody.messages?.find(
    (message) => message.role === 'assistant' && message.tool_calls,
  );
  const toolResult = secondBody.messages?.find(
    (message) => message.role === 'tool',
  );
  assert.ok(assistant);
  assert.equal(toolResult?.tool_call_id, 'call_search_1');
});

test('rejeita argumentos de tool call que não sejam JSON objeto', async () => {
  const provider = new OpenAiProvider({
    apiKey: 'test-openai-key',
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    id: 'call_invalid',
                    type: 'function',
                    function: {
                      name: 'search_project_text',
                      arguments: 'query=provider',
                    },
                  },
                ],
              },
            },
          ],
        }),
        { status: 200 },
      ),
  });

  await assert.rejects(
    provider.chatRound(
      'gpt-5.4-mini',
      [{ role: 'user', content: 'Procure provider.' }],
      roundOptions(),
    ),
    /argumentos inválidos/,
  );
});

test('completion usa a mesma barreira de masking', async () => {
  const secret = 'sk-abcdefghijklmnopqrstuvwxyz654321';
  let requestBody = '';
  const provider = new OpenAiProvider({
    apiKey: 'test-openai-key',
    fetchImpl: async (_input, init) => {
      requestBody = String(init?.body ?? '');
      return new Response(
        JSON.stringify({
          choices: [{ message: { role: 'assistant', content: 'return value;' } }],
        }),
        { status: 200 },
      );
    },
  });

  const result = await provider.complete(
    'gpt-5.4-mini',
    `const token = '${secret}';\nfunction run() {`,
    '}',
    {
      signal: new AbortController().signal,
      timeoutMs: 1_000,
      maxOutputTokens: 64,
    },
  );

  assert.equal(result.text, 'return value;');
  assert.equal(requestBody.includes(secret), false);
  assert.ok(requestBody.includes(LOG_MASK));
});
