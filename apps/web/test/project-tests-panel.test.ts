import assert from 'node:assert/strict';
import { afterEach, beforeEach, test, vi } from 'vitest';

import { mount, flushPromises } from '@vue/test-utils';

import type { ProjectTestOverview } from '@dev-dashboard/contracts';

import ProjectTestsPanel from '../src/components/ProjectTestsPanel.vue';
import { makeProject } from './support/activity-fixtures.js';

const publishedNotices = new Map<string, Record<string, unknown>>();
vi.mock('../src/stores/notice-center', () => ({
  noticeCenterStore: {
    publishTerminalNotice: vi.fn((input: Record<string, unknown>) => {
      const dedupeKey = input.dedupeKey as string;
      if (!publishedNotices.has(dedupeKey)) {
        publishedNotices.set(dedupeKey, input);
      }
    }),
  },
}));

const baseOverview: ProjectTestOverview = {
  supported: true,
  commands: [
    {
      id: 'node-script-test',
      runner: 'vitest',
      label: 'npm run test',
      description: 'Executa o script `test` do package.json.',
      origin: 'package-script',
      originDetail: 'scripts.test',
      priority: 10,
      supportsFileTarget: true,
    },
  ],
};

let cleanup: (() => void) | undefined;
beforeEach(() => {
  cleanup = undefined;
  publishedNotices.clear();
});
afterEach(() => { cleanup?.(); });

test('exibe o botão "Executar arquivo" quando o comando suporta arquivo específico', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname.endsWith('/tests')) {
      return new Response(JSON.stringify({ tests: baseOverview }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.pathname.endsWith('/tests/process')) {
      return new Response(JSON.stringify({ process: null }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  const wrapper = mount(ProjectTestsPanel, { props: { project: makeProject() } });
  cleanup = () => {
    wrapper.unmount();
    globalThis.fetch = originalFetch;
  };
  await flushPromises();
  await flushPromises();

  const buttons = wrapper.findAll('button');
  assert.ok(buttons.some((button) => button.text() === 'Executar arquivo'));
});

test('lista arquivos ao abrir o seletor e inicia a execução do arquivo escolhido', async () => {
  const calls: string[] = [];
  let currentProcess: Record<string, unknown> | null = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost');
    calls.push(url.pathname);
    if (url.pathname.endsWith('/tests')) {
      return new Response(JSON.stringify({ tests: baseOverview }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.pathname.endsWith('/tests/process')) {
      return new Response(JSON.stringify({ process: currentProcess }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.pathname.endsWith('/files')) {
      return new Response(JSON.stringify({ files: [{ path: 'src/app.test.ts' }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.pathname.endsWith('/files/start')) {
      currentProcess = { id: 'node-script-test:file', projectId: 'p1', kind: 'test', status: 'running', command: 'npm', args: ['run', 'test', '--', 'src/app.test.ts'] };
      return new Response(JSON.stringify({ process: currentProcess }), { status: 201, headers: { 'content-type': 'application/json' } });
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  const wrapper = mount(ProjectTestsPanel, { props: { project: makeProject() } });
  cleanup = () => {
    wrapper.unmount();
    globalThis.fetch = originalFetch;
  };
  await flushPromises();
  await flushPromises();

  const toggleButton = wrapper.findAll('button').find((button) => button.text() === 'Executar arquivo');
  await toggleButton!.trigger('click');
  await flushPromises();
  await flushPromises();

  assert.ok(calls.some((path) => path.endsWith('/node-script-test/files')));

  const select = wrapper.find('.tests-file-picker select');
  assert.ok(select.exists());
  await select.setValue('src/app.test.ts');

  const startFileButton = wrapper.findAll('button').find((button) => button.text().includes('Executar arquivo selecionado'));
  await startFileButton!.trigger('click');
  await flushPromises();
  await flushPromises();

  assert.ok(calls.some((path) => path.endsWith('/files/start')));
  assert.match(wrapper.text(), /Executando|Iniciando/);
});

test('mostra erro específico quando a listagem de arquivos falha', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname.endsWith('/tests')) {
      return new Response(JSON.stringify({ tests: baseOverview }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.pathname.endsWith('/tests/process')) {
      return new Response(JSON.stringify({ process: null }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.pathname.endsWith('/files')) {
      return new Response(JSON.stringify({ error: 'TEST_COMMAND_NOT_FOUND', message: 'Comando de teste não encontrado para este projeto.' }), { status: 404, headers: { 'content-type': 'application/json' } });
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  const wrapper = mount(ProjectTestsPanel, { props: { project: makeProject() } });
  cleanup = () => {
    wrapper.unmount();
    globalThis.fetch = originalFetch;
  };
  await flushPromises();
  await flushPromises();

  const toggleButton = wrapper.findAll('button').find((button) => button.text() === 'Executar arquivo');
  await toggleButton!.trigger('click');
  await flushPromises();
  await flushPromises();

  assert.match(wrapper.text(), /Comando de teste não encontrado/);
});

test('exibe o histórico de execuções retornado pela API', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname.endsWith('/tests')) {
      return new Response(JSON.stringify({ tests: baseOverview }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.pathname.endsWith('/tests/process')) {
      return new Response(JSON.stringify({ process: null }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.pathname.endsWith('/tests/history')) {
      return new Response(JSON.stringify({
        history: {
          items: [
            { id: 'exec-1', projectId: 'p1', commandId: 'node-script-test', targetFile: 'src/app.test.ts', status: 'stopped', startedAt: '2026-07-27T10:00:00Z', finishedAt: '2026-07-27T10:00:05Z', exitCode: 0 },
          ],
          page: 1, pageSize: 10, total: 1, totalPages: 1,
        },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  const wrapper = mount(ProjectTestsPanel, { props: { project: makeProject() } });
  cleanup = () => {
    wrapper.unmount();
    globalThis.fetch = originalFetch;
  };
  await flushPromises();
  await flushPromises();

  assert.match(wrapper.text(), /Histórico de execuções/);
  const items = wrapper.findAll('.tests-history-list li');
  assert.equal(items.length, 1);
  assert.match(items[0]!.text(), /npm run test/);
  assert.match(items[0]!.text(), /src\/app\.test\.ts/);
});

test('pagina o histórico ao clicar em Próxima', async () => {
  const calls: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost');
    calls.push(url.search);
    if (url.pathname.endsWith('/tests')) {
      return new Response(JSON.stringify({ tests: baseOverview }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.pathname.endsWith('/tests/process')) {
      return new Response(JSON.stringify({ process: null }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.pathname.endsWith('/tests/history')) {
      const page = Number(url.searchParams.get('page') ?? '1');
      return new Response(JSON.stringify({
        history: {
          items: [{ id: `exec-${page}`, projectId: 'p1', commandId: 'node-script-test', status: 'stopped', startedAt: '2026-07-27T10:00:00Z' }],
          page, pageSize: 10, total: 15, totalPages: 2,
        },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  const wrapper = mount(ProjectTestsPanel, { props: { project: makeProject() } });
  cleanup = () => {
    wrapper.unmount();
    globalThis.fetch = originalFetch;
  };
  await flushPromises();
  await flushPromises();

  assert.match(wrapper.text(), /Página 1 de 2/);
  const nextButton = wrapper.findAll('button').find((button) => button.text() === 'Próxima');
  await nextButton!.trigger('click');
  await flushPromises();
  await flushPromises();

  assert.match(wrapper.text(), /Página 2 de 2/);
  assert.ok(calls.some((search) => search.includes('page=2')));
});

test('limpa o histórico de execuções após confirmação', async () => {
  const calls: Array<{ method: string; pathname: string }> = [];
  let cleared = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const method = init?.method ?? 'GET';
    calls.push({ method, pathname: url.pathname });
    if (url.pathname.endsWith('/tests')) {
      return new Response(JSON.stringify({ tests: baseOverview }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.pathname.endsWith('/tests/process')) {
      return new Response(JSON.stringify({ process: null }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.pathname.endsWith('/tests/history') && method === 'DELETE') {
      cleared = true;
      return new Response(JSON.stringify({ history: { removedCount: 1 } }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.pathname.endsWith('/tests/history')) {
      const items = cleared
        ? []
        : [{ id: 'exec-1', projectId: 'p1', commandId: 'node-script-test', status: 'stopped', startedAt: '2026-07-27T10:00:00Z' }];
      return new Response(JSON.stringify({
        history: { items, page: 1, pageSize: 10, total: items.length, totalPages: items.length ? 1 : 0 },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  const originalConfirm = window.confirm;
  window.confirm = () => true;

  const wrapper = mount(ProjectTestsPanel, { props: { project: makeProject() } });
  cleanup = () => {
    wrapper.unmount();
    globalThis.fetch = originalFetch;
    window.confirm = originalConfirm;
  };
  await flushPromises();
  await flushPromises();

  assert.equal(wrapper.findAll('.tests-history-list li').length, 1);

  const clearButton = wrapper.find('button[aria-label="Limpar histórico"]');
  assert.ok(clearButton.exists());
  await clearButton.trigger('click');
  await flushPromises();
  await flushPromises();

  assert.ok(calls.some((call) => call.method === 'DELETE' && call.pathname.endsWith('/tests/history')));
  assert.equal(wrapper.findAll('.tests-history-list li').length, 0);
  assert.match(wrapper.text(), /Nenhuma execução registrada ainda/);
});

function sseResponse(frames: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const frame of frames) controller.enqueue(encoder.encode(frame));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

test('acompanha a execução em andamento via SSE e atualiza estado e log em tempo real', async () => {
  const originalFetch = globalThis.fetch;
  let currentProcess: Record<string, unknown> = {
    id: 'node-script-test', projectId: 'p1', kind: 'test', status: 'running',
    command: 'npm', args: ['run', 'test'], startedAt: '2026-07-27T10:00:00Z',
  };
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname.endsWith('/tests')) {
      return new Response(JSON.stringify({ tests: baseOverview }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.pathname.endsWith('/tests/process/events')) {
      currentProcess = { ...currentProcess, status: 'stopped', stoppedAt: '2026-07-27T10:00:05Z', exitCode: 0 };
      return sseResponse([
        `event: state\ndata: ${JSON.stringify({ type: 'state', process: currentProcess })}\n\n`,
        `event: log\ndata: ${JSON.stringify({ type: 'log', log: { projectId: 'p1', processId: 'node-script-test', content: 'saída via SSE', sizeBytes: 13, truncated: false, masked: false, redactionCount: 0, readAt: new Date().toISOString() } })}\n\n`,
      ]);
    }
    if (url.pathname.endsWith('/tests/process/logs')) {
      return new Response(JSON.stringify({ log: { projectId: 'p1', processId: 'node-script-test', content: 'saída via SSE', sizeBytes: 13, truncated: false, masked: false, redactionCount: 0, readAt: new Date().toISOString() } }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.pathname.endsWith('/tests/process')) {
      return new Response(JSON.stringify({ process: currentProcess }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.pathname.endsWith('/tests/history')) {
      return new Response(JSON.stringify({ history: { items: [], page: 1, pageSize: 10, total: 0, totalPages: 0 } }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  const wrapper = mount(ProjectTestsPanel, { props: { project: makeProject() } });
  cleanup = () => {
    wrapper.unmount();
    globalThis.fetch = originalFetch;
  };
  for (let attempt = 0; attempt < 20 && !wrapper.text().includes('Concluído com sucesso'); attempt += 1) {
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  assert.match(wrapper.text(), /Concluído com sucesso/);
  assert.match(wrapper.text(), /saída via SSE/);
});

test('publica aviso ao receber estado terminal após passar por running', async () => {
  const { noticeCenterStore } = await import('../src/stores/notice-center');

  const originalFetch = globalThis.fetch;
  let currentProcess: Record<string, unknown> | null = null;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname === '/api/projects/p1/tests') {
      return new Response(JSON.stringify({ tests: baseOverview }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.pathname === '/api/projects/p1/tests/node-script-test/start') {
      currentProcess = { id: 'node-script-test', projectId: 'p1', kind: 'test', status: 'running', command: 'npm', args: ['run', 'test'], startedAt: '2026-07-27T10:00:00Z' };
      return new Response(JSON.stringify({ process: currentProcess }), { status: 201, headers: { 'content-type': 'application/json' } });
    }
    if (url.pathname === '/api/projects/p1/tests/process/events') {
      currentProcess = { ...currentProcess, status: 'failed', stoppedAt: '2026-07-27T10:00:05Z', exitCode: 1 };
      return sseResponse([
        `event: state\ndata: ${JSON.stringify({ type: 'state', process: currentProcess })}\n\n`,
      ]);
    }
    if (url.pathname === '/api/projects/p1/tests/process') {
      return new Response(JSON.stringify({ process: currentProcess }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.pathname === '/api/projects/p1/tests/history') {
      return new Response(JSON.stringify({ history: { items: [], page: 1, pageSize: 10, total: 0, totalPages: 0 } }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  const wrapper = mount(ProjectTestsPanel, { props: { project: makeProject() } });
  cleanup = () => {
    wrapper.unmount();
    globalThis.fetch = originalFetch;
  };
  await flushPromises();
  await flushPromises();

  const startButton = wrapper.findAll('button').find((button) => button.text() === 'Executar');
  await startButton!.trigger('click');
  await flushPromises();

  for (let attempt = 0; attempt < 20 && publishedNotices.size === 0; attempt += 1) {
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  assert.equal(publishedNotices.size, 1, 'deve ter publicado com um dedupeKey único');
  const call = Array.from(publishedNotices.values())[0]! as Record<string, unknown>;
  assert.equal(call.origin, 'test');
  assert.equal(call.outcome, 'failed');
  assert.equal(call.projectId, 'p1');
  assert.equal(call.label, 'npm run test');
  assert.equal((call.routeTo as Record<string, unknown>).name, 'project-tests');
  assert.deepEqual((call.routeTo as Record<string, unknown>).params, { projectId: 'p1' });
});

test('não publica aviso duplicado ao reconectar com o mesmo estado terminal', async () => {
  const originalFetch = globalThis.fetch;
  let eventStreamCallCount = 0;
  let currentProcess: Record<string, unknown> | null = null;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname === '/api/projects/p1/tests') {
      return new Response(JSON.stringify({ tests: baseOverview }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.pathname === '/api/projects/p1/tests/node-script-test/start') {
      currentProcess = { id: 'node-script-test', projectId: 'p1', kind: 'test', status: 'running', command: 'npm', args: ['run', 'test'], startedAt: '2026-07-27T10:00:00Z' };
      return new Response(JSON.stringify({ process: currentProcess }), { status: 201, headers: { 'content-type': 'application/json' } });
    }
    if (url.pathname === '/api/projects/p1/tests/process/events') {
      eventStreamCallCount += 1;
      currentProcess = { ...currentProcess, status: 'failed', stoppedAt: '2026-07-27T10:00:05Z', exitCode: 1 };
      return sseResponse([
        `event: state\ndata: ${JSON.stringify({ type: 'state', process: currentProcess })}\n\n`,
      ]);
    }
    if (url.pathname === '/api/projects/p1/tests/process') {
      return new Response(JSON.stringify({ process: currentProcess }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.pathname === '/api/projects/p1/tests/history') {
      return new Response(JSON.stringify({ history: { items: [], page: 1, pageSize: 10, total: 0, totalPages: 0 } }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  const wrapper = mount(ProjectTestsPanel, { props: { project: makeProject() } });
  cleanup = () => {
    wrapper.unmount();
    globalThis.fetch = originalFetch;
  };
  await flushPromises();
  await flushPromises();

  const startButton = wrapper.findAll('button').find((button) => button.text() === 'Executar');
  await startButton!.trigger('click');
  await flushPromises();

  for (let attempt = 0; attempt < 20 && publishedNotices.size === 0; attempt += 1) {
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  const noticesAfterFirstTerminal = publishedNotices.size;
  assert.equal(noticesAfterFirstTerminal, 1, 'deve ter publicado com um dedupeKey único');

  for (let attempt = 0; attempt < 50; attempt += 1) {
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  assert.equal(publishedNotices.size, noticesAfterFirstTerminal, 'não deve publicar novas chaves mesmo após reconexões');
});

test('não publica aviso quando processo já chega parado na primeira renderização', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname === '/api/projects/p1/tests') {
      return new Response(JSON.stringify({ tests: baseOverview }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.pathname === '/api/projects/p1/tests/process') {
      return new Response(JSON.stringify({
        process: {
          id: 'node-script-test', projectId: 'p1', kind: 'test', status: 'stopped',
          command: 'npm', args: ['run', 'test'], startedAt: '2026-07-27T09:00:00Z', stoppedAt: '2026-07-27T09:00:05Z', exitCode: 0,
        },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.pathname === '/api/projects/p1/tests/history') {
      return new Response(JSON.stringify({ history: { items: [], page: 1, pageSize: 10, total: 0, totalPages: 0 } }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  const wrapper = mount(ProjectTestsPanel, { props: { project: makeProject() } });
  cleanup = () => {
    wrapper.unmount();
    globalThis.fetch = originalFetch;
  };

  for (let attempt = 0; attempt < 20; attempt += 1) {
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  assert.equal(publishedNotices.size, 0, 'não deve ter publicado aviso para processo já parado');
});
