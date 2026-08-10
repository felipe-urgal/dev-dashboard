import assert from 'node:assert/strict';
import test from 'node:test';

import type { AiChatStreamEvent, Project } from '@dev-dashboard/contracts';

import { AiAssistantService } from '../src/services/ai-assistant-service.js';
import { GitService } from '../src/services/git-service.js';
import { ProjectFileService } from '../src/services/project-file-service.js';

function project(): Project {
  return {
    id: 'project-1',
    name: 'Painel',
    path: '/tmp/inexistente',
    type: 'node',
    source: 'workspace',
    favorite: false,
    enabled: true,
    capabilities: [],
  };
}

test('chat() usa resposta não-streaming quando envia ferramentas ao Ollama', async () => {
  let requestBody: Record<string, unknown> | undefined;
  const events: AiChatStreamEvent[] = [];
  const service = new AiAssistantService({
    projectFileService: new ProjectFileService(),
    gitService: new GitService(),
    fetchImpl: async (_input, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(
        JSON.stringify({
          message: { role: 'assistant', content: 'Resposta final.' },
          done: true,
        }),
        { status: 200 },
      );
    },
  });

  await service.chat(
    project(),
    'qwen2.5-coder:7b',
    [{ role: 'user', content: 'Analise o projeto.' }],
    {
      signal: new AbortController().signal,
      send: (event) => events.push(event),
    },
  );

  assert.ok(requestBody);
  assert.equal(requestBody.stream, false);
  assert.ok(Array.isArray(requestBody.tools));
  assert.deepEqual(events, [
    { type: 'message-delta', content: 'Resposta final.' },
    { type: 'done' },
  ]);
});

test(
  'chat() converte tool call textual vazada pelo Ollama e continua o loop',
  async () => {
    const events: AiChatStreamEvent[] = [];
    const leakedToolCall = JSON.stringify({
      name: 'search_project_text',
      arguments: { query: 'problema com o novo fluxo de ferramenta' },
    });
    let requestCount = 0;
    const service = new AiAssistantService({
      projectFileService: new ProjectFileService(),
      gitService: new GitService(),
      fetchImpl: async () => {
        requestCount += 1;
        return new Response(
          JSON.stringify({
            message: {
              role: 'assistant',
              content: requestCount === 1 ? leakedToolCall : 'Resposta final.',
            },
            done: true,
          }),
          { status: 200 },
        );
      },
    });

    await service.chat(
      project(),
      'qwen2.5-coder:7b',
      [{ role: 'user', content: 'Investigue o problema.' }],
      {
        signal: new AbortController().signal,
        send: (event) => events.push(event),
      },
    );

    assert.equal(requestCount, 2);
    assert.equal(events[0]?.type, 'tool-call');
    assert.equal(events[1]?.type, 'tool-result');
    assert.equal(events[2]?.type, 'message-delta');
    assert.deepEqual(events[3], { type: 'done' });
    assert.equal(events.some((event) => event.type === 'error'), false);
  },
);
