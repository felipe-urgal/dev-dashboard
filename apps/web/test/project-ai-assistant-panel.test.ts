import assert from 'node:assert/strict';
import { afterEach, test, vi } from 'vitest';

import { flushPromises, mount } from '@vue/test-utils';

import type {
  AiImplementationExecution,
  AiProviderId,
  ProjectAiProvidersStatus,
} from '@dev-dashboard/contracts';

import ProjectAiAssistantPanel from '../src/components/ProjectAiAssistantPanel.vue';
import { makeProject } from './support/activity-fixtures.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.useRealTimers();
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function providersStatus(
  options: {
    selectedProvider?: AiProviderId;
    ollamaAvailable?: boolean;
    openaiAvailable?: boolean;
    openaiConsent?: boolean;
  } = {},
): ProjectAiProvidersStatus {
  const {
    selectedProvider = 'ollama',
    ollamaAvailable = true,
    openaiAvailable = false,
    openaiConsent = false,
  } = options;
  return {
    selectedProvider,
    selectedMode: 'fast',
    providers: [
      {
        id: 'ollama',
        label: 'Local',
        kind: 'local',
        available: ollamaAvailable,
        models: ollamaAvailable
          ? [
              {
                name: 'qwen2.5-coder:14b',
                capabilities: ['chat', 'tools'],
              },
            ]
          : [],
        message: ollamaAvailable
          ? '1 modelo instalado no Ollama local.'
          : 'Ollama indisponível.',
        consentRequired: false,
        consentGranted: true,
      },
      {
        id: 'openai',
        label: 'OpenAI',
        kind: 'cloud',
        available: openaiAvailable,
        models: openaiAvailable
          ? [{ name: 'gpt-5-mini', capabilities: ['chat', 'tools'] }]
          : [],
        message: openaiAvailable
          ? 'OpenAI disponível.'
          : 'OpenAI não configurada.',
        consentRequired: true,
        consentGranted: openaiConsent,
      },
    ],
  };
}

function execution(
  status: AiImplementationExecution['status'] = 'running',
): AiImplementationExecution {
  return {
    id: 'e852c4aa-e432-4fd8-a326-d30f366b9ad5',
    projectId: 'p1',
    provider: 'ollama',
    mode: 'fast',
    model: 'qwen2.5-coder:14b',
    prompt: 'Adicionar testes',
    status,
    createdAt: '2026-08-10T12:00:00.000Z',
    updatedAt: '2026-08-10T12:00:00.000Z',
    ...(status === 'failed' ? { finishedAt: '2026-08-10T12:00:10.000Z' } : {}),
    events:
      status === 'failed'
        ? [{ type: 'error', message: 'Ollama ficou indisponível.' }]
        : [],
  };
}

test('inicia uma implementação e mantém o aviso de execução em segundo plano', async () => {
  const runningExecution = execution();
  const requests: Array<{ path: string; method: string; body?: unknown }> = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input), 'http://localhost');
    requests.push({
      path: url.pathname,
      method: init?.method ?? 'GET',
      ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}),
    });
    if (url.pathname.endsWith('/ai/providers')) {
      return json(providersStatus());
    }
    if (
      url.pathname.endsWith('/ai/implementations') &&
      init?.method === 'POST'
    ) {
      return json({ execution: runningExecution });
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
  const runningExecution = execution();
  let implementationReads = 0;

  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname.endsWith('/ai/providers')) {
      return json(providersStatus());
    }
    if (
      url.pathname.endsWith('/ai/implementations') &&
      init?.method === 'POST'
    ) {
      return json({ execution: runningExecution });
    }
    if (url.pathname.endsWith('/ai/implementations')) {
      implementationReads += 1;
      return json({
        execution: implementationReads === 1 ? null : runningExecution,
      });
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

test('oferece provider disponível e restaura somente o pedido original', async () => {
  const failedExecution = execution('failed');
  const selectionRequests: unknown[] = [];

  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname.endsWith('/ai/selection') && init?.method === 'PUT') {
      selectionRequests.push(JSON.parse(String(init.body)));
      return json(
        providersStatus({
          selectedProvider: 'openai',
          ollamaAvailable: false,
          openaiAvailable: true,
        }),
      );
    }
    if (url.pathname.endsWith('/ai/providers')) {
      return json(
        providersStatus({
          ollamaAvailable: false,
          openaiAvailable: true,
        }),
      );
    }
    if (url.pathname.endsWith('/ai/implementations')) {
      return json({ execution: failedExecution });
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

  assert.match(wrapper.text(), /Local falhou · OpenAI disponível/);
  assert.match(wrapper.text(), /somente o pedido original/);

  const useOpenAi = wrapper
    .findAll('button')
    .find((button) => button.text().includes('Usar OpenAI'));
  assert.ok(useOpenAi);
  await useOpenAi.trigger('click');
  await flushPromises();

  assert.deepEqual(selectionRequests, [{ provider: 'openai', mode: 'fast' }]);
  assert.equal(
    (wrapper.get('textarea').element as HTMLTextAreaElement).value,
    'Adicionar testes',
  );
  assert.match(wrapper.text(), /Autorizar envio de código à OpenAI/);
  wrapper.unmount();
});

test('permite recusar a oferta de fallback sem trocar provider', async () => {
  const failedExecution = execution('failed');
  let selectionWrites = 0;

  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname.endsWith('/ai/selection') && init?.method === 'PUT') {
      selectionWrites += 1;
    }
    if (url.pathname.endsWith('/ai/providers')) {
      return json(
        providersStatus({
          ollamaAvailable: false,
          openaiAvailable: true,
        }),
      );
    }
    if (url.pathname.endsWith('/ai/implementations')) {
      return json({ execution: failedExecution });
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

  const dismiss = wrapper
    .findAll('button')
    .find((button) => button.text().includes('Agora não'));
  assert.ok(dismiss);
  await dismiss.trigger('click');
  await flushPromises();

  assert.doesNotMatch(wrapper.text(), /Local falhou · OpenAI disponível/);
  assert.equal(selectionWrites, 0);
  wrapper.unmount();
});

test('mantém a oferta quando a seleção de fallback não é persistida', async () => {
  const failedExecution = execution('failed');

  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname.endsWith('/ai/selection') && init?.method === 'PUT') {
      return json({ message: 'Falha ao salvar seleção.' }, 500);
    }
    if (url.pathname.endsWith('/ai/providers')) {
      return json(
        providersStatus({
          ollamaAvailable: false,
          openaiAvailable: true,
        }),
      );
    }
    if (url.pathname.endsWith('/ai/implementations')) {
      return json({ execution: failedExecution });
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

  const useOpenAi = wrapper
    .findAll('button')
    .find((button) => button.text().includes('Usar OpenAI'));
  assert.ok(useOpenAi);
  await useOpenAi.trigger('click');
  await flushPromises();

  assert.match(wrapper.text(), /Local falhou · OpenAI disponível/);
  assert.equal(
    (
      wrapper.get('.ai-assistant-execution-options select')
        .element as HTMLSelectElement
    ).value,
    'ollama',
  );
  assert.equal(
    (wrapper.get('textarea').element as HTMLTextAreaElement).value,
    '',
  );
  wrapper.unmount();
});

test('mantém consentimento anterior e mostra erro quando a persistência falha', async () => {
  const consentRequests: unknown[] = [];

  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input), 'http://localhost');
    if (
      url.pathname.endsWith('/providers/openai/consent') &&
      init?.method === 'PUT'
    ) {
      consentRequests.push(JSON.parse(String(init.body)));
      return json({ message: 'Falha ao salvar consentimento.' }, 500);
    }
    if (url.pathname.endsWith('/ai/selection') && init?.method === 'PUT') {
      return json(
        providersStatus({
          selectedProvider: 'openai',
          ollamaAvailable: true,
          openaiAvailable: true,
        }),
      );
    }
    if (url.pathname.endsWith('/ai/providers')) {
      return json(
        providersStatus({
          ollamaAvailable: true,
          openaiAvailable: true,
        }),
      );
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

  await wrapper
    .get('.ai-assistant-execution-options select')
    .setValue('openai');
  await flushPromises();

  const authorize = wrapper
    .findAll('button')
    .find((button) => button.text().includes('Autorizar neste projeto'));
  assert.ok(authorize);
  await authorize.trigger('click');
  await flushPromises();

  assert.deepEqual(consentRequests, [{ granted: true }]);
  assert.match(wrapper.text(), /Falha ao salvar consentimento\./);
  assert.match(wrapper.text(), /Autorizar envio de código à OpenAI\?/);
  assert.equal(
    wrapper
      .findAll('button')
      .some((button) => button.text().includes('Revogar acesso cloud')),
    false,
  );
  wrapper.unmount();
});

test('restaura provider persistido quando a troca manual falha', async () => {
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname.endsWith('/ai/selection') && init?.method === 'PUT') {
      return json({ message: 'Falha ao salvar seleção.' }, 500);
    }
    if (url.pathname.endsWith('/ai/providers')) {
      return json(
        providersStatus({
          ollamaAvailable: true,
          openaiAvailable: true,
        }),
      );
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

  const providerSelect = wrapper.get('.ai-assistant-execution-options select');
  await providerSelect.setValue('openai');
  await flushPromises();

  assert.equal((providerSelect.element as HTMLSelectElement).value, 'ollama');
  wrapper.unmount();
});
