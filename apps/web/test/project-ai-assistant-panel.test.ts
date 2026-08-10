import assert from 'node:assert/strict';
import { afterEach, test, vi } from 'vitest';

import { flushPromises, mount } from '@vue/test-utils';

import type { AiImplementationExecution } from '@dev-dashboard/contracts';

import ProjectAiAssistantPanel from '../src/components/ProjectAiAssistantPanel.vue';
import { makeProject } from './support/activity-fixtures.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.useRealTimers();
});

function json(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    headers: { 'content-type': 'application/json' },
  });
}

test('inicia uma implementação e mantém o aviso de execução em segundo plano', async () => {
  const execution: AiImplementationExecution = {
    id: 'e852c4aa-e432-4fd8-a326-d30f366b9ad5',
    projectId: 'p1',
    model: 'qwen2.5-coder:14b',
    prompt: 'Adicionar testes',
    status: 'running',
    createdAt: '2026-08-10T12:00:00.000Z',
    updatedAt: '2026-08-10T12:00:00.000Z',
    events: [],
  };
  const requests: Array<{ path: string; method: string; body?: unknown }> = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input), 'http://localhost');
    requests.push({
      path: url.pathname,
      method: init?.method ?? 'GET',
      ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}),
    });
    if (url.pathname.endsWith('/ai/status')) {
      return json({
        available: true,
        models: [
          { name: 'qwen2.5-coder:14b', capabilities: ['chat', 'tools'] },
        ],
        message: '1 modelo instalado no Ollama local.',
      });
    }
    if (
      url.pathname.endsWith('/ai/implementations') &&
      init?.method === 'POST'
    ) {
      return json({ execution });
    }
    return json({ execution: null });
  };

  const wrapper = mount(ProjectAiAssistantPanel, {
    props: {
      project: makeProject({ id: '' }),
      projectId: 'p1',
    },
  });
  await flushPromises();

  await wrapper.get('textarea').setValue('Adicionar testes');
  await wrapper.get('select').setValue('qwen2.5-coder:14b');
  await wrapper.get('.ai-assistant-start').trigger('click');
  await flushPromises();

  assert.deepEqual(
    requests.find((request) => request.method === 'POST'),
    {
      path: '/api/projects/p1/ai/implementations',
      method: 'POST',
      body: { model: 'qwen2.5-coder:14b', prompt: 'Adicionar testes' },
    },
  );
  assert.match(wrapper.text(), /execução continuará em segundo plano/);
  assert.match(wrapper.text(), /Em execução/);
  wrapper.unmount();
});

test('mantém o polling local sem propagar atualização para o pai a cada ciclo', async () => {
  vi.useFakeTimers();
  const execution: AiImplementationExecution = {
    id: 'e852c4aa-e432-4fd8-a326-d30f366b9ad5',
    projectId: 'p1',
    model: 'qwen2.5-coder:14b',
    prompt: 'Adicionar testes',
    status: 'running',
    createdAt: '2026-08-10T12:00:00.000Z',
    updatedAt: '2026-08-10T12:00:00.000Z',
    events: [],
  };
  let implementationReads = 0;

  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname.endsWith('/ai/status')) {
      return json({
        available: true,
        models: [
          { name: 'qwen2.5-coder:14b', capabilities: ['chat', 'tools'] },
        ],
        message: '1 modelo instalado no Ollama local.',
      });
    }
    if (
      url.pathname.endsWith('/ai/implementations') &&
      init?.method === 'POST'
    ) {
      return json({ execution });
    }
    if (url.pathname.endsWith('/ai/implementations')) {
      implementationReads += 1;
      return json({ execution: implementationReads === 1 ? null : execution });
    }
    return json({ execution: null });
  };

  const wrapper = mount(ProjectAiAssistantPanel, {
    props: {
      project: makeProject({ id: '' }),
      projectId: 'p1',
    },
  });
  await flushPromises();

  await wrapper.get('textarea').setValue('Adicionar testes');
  await wrapper.get('select').setValue('qwen2.5-coder:14b');
  await wrapper.get('.ai-assistant-start').trigger('click');
  await flushPromises();

  assert.equal(wrapper.emitted('execution-updated')?.length, 1);
  assert.equal(implementationReads, 1);

  await vi.advanceTimersByTimeAsync(1_500);
  await flushPromises();

  assert.equal(implementationReads, 2);
  assert.equal(wrapper.emitted('execution-updated')?.length, 1);
  wrapper.unmount();
});
