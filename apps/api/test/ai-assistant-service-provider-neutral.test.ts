import assert from 'node:assert/strict';
import test from 'node:test';

import type { AiChatStreamEvent, Project } from '@dev-dashboard/contracts';

import { AiAssistantService } from '../src/services/ai-assistant-service.js';
import { GitService } from '../src/services/git-service.js';
import { ProjectFileService } from '../src/services/project-file-service.js';

const project: Project = {
  id: 'project-neutral-message',
  name: 'Projeto',
  path: '/tmp/inexistente',
  type: 'node',
  source: 'workspace',
  enabled: true,
  capabilities: [],
};

test('mensagem de modelo obrigatório não depende do provider', async () => {
  const service = new AiAssistantService({
    projectFileService: new ProjectFileService(),
    gitService: new GitService(),
    fetchImpl: async () => {
      throw new Error('não deveria chamar fetch');
    },
  });
  const events: AiChatStreamEvent[] = [];

  await service.chat(project, '', [{ role: 'user', content: 'Teste' }], {
    signal: new AbortController().signal,
    send: (event) => events.push(event),
  });

  const error = events.find((event) => event.type === 'error');
  assert.ok(error?.type === 'error');
  assert.match(error.message, /modelo de IA disponível/);
  assert.doesNotMatch(error.message, /Ollama/);

  await assert.rejects(
    service.review(
      '',
      [{ role: 'user', content: 'Revise' }],
      new AbortController().signal,
    ),
    /modelo de IA disponível/,
  );
  await assert.rejects(
    service.complete('', 'const x = ', '', new AbortController().signal),
    /modelo de IA disponível/,
  );
});
