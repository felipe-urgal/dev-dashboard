import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { AiChatStreamEvent, Project } from '@dev-dashboard/contracts';

import { AiAssistantService } from '../src/services/ai-assistant-service.js';
import { GitService } from '../src/services/git-service.js';
import { ProjectFileService } from '../src/services/project-file-service.js';

function project(root: string): Project {
  return {
    id: 'project-1',
    name: 'Painel',
    path: root,
    type: 'node',
    source: 'workspace',
    enabled: true,
    capabilities: [],
  };
}

function toolCallResponse(): Response {
  return new Response(
    JSON.stringify({
      message: {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            function: {
              name: 'list_project_files',
              arguments: {},
            },
          },
        ],
      },
      done: true,
    }),
  );
}

test('chat() encerra após quatro rodadas de ferramentas sem progresso', async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), 'dev-dashboard-ai-round-limit-'),
  );
  try {
    let calls = 0;
    const events: AiChatStreamEvent[] = [];
    const service = new AiAssistantService({
      projectFileService: new ProjectFileService(),
      gitService: new GitService(),
      fetchImpl: async () => {
        calls += 1;
        return toolCallResponse();
      },
    });

    await service.chat(
      project(root),
      'qwen2.5-coder:14b',
      [{ role: 'user', content: 'Continue investigando indefinidamente.' }],
      {
        signal: new AbortController().signal,
        send: (event) => events.push(event),
      },
    );

    assert.equal(calls, 4);
    const error = events.at(-1);
    assert.ok(error && error.type === 'error');
    assert.match(error.message, /ferramentas demais/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('chat() interrompe uma rodada em andamento quando o usuário cancela', async () => {
  const controller = new AbortController();
  const events: AiChatStreamEvent[] = [];
  let fetchAborted = false;
  const service = new AiAssistantService({
    projectFileService: new ProjectFileService(),
    gitService: new GitService(),
    fetchImpl: async (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          fetchAborted = true;
          reject(new DOMException('This operation was aborted', 'AbortError'));
        });
      }),
  });

  const running = service.chat(
    project('/tmp/inexistente'),
    'qwen2.5-coder:14b',
    [{ role: 'user', content: 'Analise o projeto.' }],
    {
      signal: controller.signal,
      send: (event) => events.push(event),
    },
  );
  await new Promise((resolve) => setImmediate(resolve));
  controller.abort();
  await running;

  assert.equal(fetchAborted, true);
  assert.deepEqual(events, []);
});
