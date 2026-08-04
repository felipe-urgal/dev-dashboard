import assert from 'node:assert/strict';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, test } from 'vitest';

import type { AiChatStreamEvent, ProjectAiStatus } from '@dev-dashboard/contracts';

import ProjectAiPanel from '../src/components/ProjectAiPanel.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function sseResponse(events: AiChatStreamEvent[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`));
      }
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

let originalFetch: typeof fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function installFetchMock(options: {
  status: ProjectAiStatus;
  chatEvents?: AiChatStreamEvent[];
  chatRequests?: Array<{ model: string; messages: unknown[] }>;
}): void {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname.endsWith('/ai/status')) return jsonResponse(options.status);
    if (url.pathname.endsWith('/ai/chat') && init?.method === 'POST') {
      const body = JSON.parse(String(init.body)) as { model: string; messages: unknown[] };
      options.chatRequests?.push(body);
      return sseResponse(options.chatEvents ?? []);
    }
    throw new Error(`chamada inesperada: ${url.pathname}`);
  }) as typeof fetch;
}

function mountPanel() {
  return mount(ProjectAiPanel, {
    props: {
      projectId: 'project-1',
      activeFilePath: 'app/models/user.rb',
      activeFileLanguage: 'ruby',
      selectedText: '',
    },
  });
}

test('mostra orientação clara quando o Ollama local não está disponível', async () => {
  installFetchMock({
    status: {
      available: false,
      models: [],
      message: 'Ollama local não foi detectado em http://127.0.0.1:11434.',
    },
  });
  const wrapper = mountPanel();
  await flushPromises();

  assert.match(wrapper.text(), /não foi detectado/);
  assert.equal(wrapper.find('#ai-panel-input').exists(), false);
  wrapper.unmount();
});

test('envia uma mensagem e exibe a resposta transmitida em streaming', async () => {
  const chatRequests: Array<{ model: string; messages: unknown[] }> = [];
  installFetchMock({
    status: {
      available: true,
      models: [{ name: 'llama3.1', capabilities: ['chat'] }],
      message: '1 modelo instalado.',
    },
    chatEvents: [
      { type: 'message-delta', content: 'Olá' },
      { type: 'message-delta', content: ', tudo bem?' },
      { type: 'done' },
    ],
    chatRequests,
  });
  const wrapper = mountPanel();
  await flushPromises();

  await wrapper.get('#ai-panel-input').setValue('Explique este arquivo.');
  await wrapper.get('.ai-panel-composer').trigger('submit');
  await flushPromises();

  assert.equal(chatRequests.length, 1);
  assert.equal(chatRequests[0]?.model, 'llama3.1');
  assert.match(wrapper.text(), /Explique este arquivo\./);
  assert.match(wrapper.text(), /Olá, tudo bem\?/);
  wrapper.unmount();
});

test('ação rápida preenche o campo com o trecho selecionado', async () => {
  installFetchMock({
    status: {
      available: true,
      models: [{ name: 'llama3.1', capabilities: ['chat'] }],
      message: '1 modelo instalado.',
    },
  });
  const wrapper = mount(ProjectAiPanel, {
    props: {
      projectId: 'project-1',
      activeFilePath: 'app/models/user.rb',
      activeFileLanguage: 'ruby',
      selectedText: 'def full_name\n  "#{first_name} #{last_name}"\nend',
    },
  });
  await flushPromises();

  await wrapper.findAll('.ai-panel-actions button')[0]?.trigger('click');

  const textarea = wrapper.get<HTMLTextAreaElement>('#ai-panel-input');
  assert.match(textarea.element.value, /Explique o que este trecho faz\./);
  assert.match(textarea.element.value, /full_name/);
  wrapper.unmount();
});

test('erro do assistente é exibido e a conversa não trava em "enviando"', async () => {
  installFetchMock({
    status: {
      available: true,
      models: [{ name: 'llama3.1', capabilities: ['chat'] }],
      message: '1 modelo instalado.',
    },
    chatEvents: [
      { type: 'error', message: 'O Ollama respondeu com status 500.' },
    ],
  });
  const wrapper = mountPanel();
  await flushPromises();

  await wrapper.get('#ai-panel-input').setValue('Oi');
  await wrapper.get('.ai-panel-composer').trigger('submit');
  await flushPromises();

  assert.match(wrapper.text(), /status 500/);
  assert.equal(wrapper.find('#ai-panel-input').attributes('disabled'), undefined);
  wrapper.unmount();
});

test('emite workspace-edit-proposed quando o assistente propõe uma edição', async () => {
  const preview = {
    confirmationToken: 'token-abc',
    files: [{
      path: 'app/models/user.rb',
      language: 'ruby',
      beforeVersion: 'a'.repeat(64),
      beforeContent: 'old',
      afterContent: 'new',
    }],
    expiresAt: new Date().toISOString(),
  };
  installFetchMock({
    status: {
      available: true,
      models: [{ name: 'llama3.1', capabilities: ['chat', 'tools'] }],
      message: '1 modelo instalado.',
    },
    chatEvents: [
      { type: 'workspace-edit-proposed', preview },
      { type: 'done' },
    ],
  });
  const wrapper = mountPanel();
  await flushPromises();

  await wrapper.get('#ai-panel-input').setValue('Corrija este arquivo.');
  await wrapper.get('.ai-panel-composer').trigger('submit');
  await flushPromises();

  const emitted = wrapper.emitted('workspace-edit-proposed');
  assert.ok(emitted);
  assert.deepEqual(emitted?.[0]?.[0], preview);
  wrapper.unmount();
});
