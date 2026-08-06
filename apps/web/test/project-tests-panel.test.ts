import assert from 'node:assert/strict';
import { afterEach, beforeEach, test, vi } from 'vitest';

import { flushPromises, mount } from '@vue/test-utils';

import type { ProjectTestOverview } from '@dev-dashboard/contracts';

import ProjectTestsPanel from '../src/components/ProjectTestsPanel.vue';
import { makeProject } from './support/activity-fixtures.js';
import { createTestRouter } from './support/test-router';

const publishedNotices = new Map<string, Record<string, unknown>>();
vi.mock('../src/stores/notice-center', () => ({
  noticeCenterStore: {
    publishTerminalNotice: vi.fn((input: Record<string, unknown>) => {
      const dedupeKey = input.dedupeKey as string;
      if (!publishedNotices.has(dedupeKey))
        publishedNotices.set(dedupeKey, input);
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
      supportsCaseTarget: false,
    },
  ],
};

const rspecOverview: ProjectTestOverview = {
  supported: true,
  commands: [
    {
      id: 'rspec-suite',
      runner: 'rspec',
      label: 'bundle exec rspec',
      description: 'Executa a suíte RSpec do projeto.',
      origin: 'gemfile',
      priority: 10,
      supportsFileTarget: true,
      supportsCaseTarget: true,
    },
  ],
};

let cleanup: (() => void) | undefined;

beforeEach(() => {
  cleanup = undefined;
  publishedNotices.clear();
});

afterEach(() => {
  cleanup?.();
});

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function emptyPanelFetch(input: RequestInfo | URL): Promise<Response> {
  const url = new URL(String(input), 'http://localhost');
  if (url.pathname.endsWith('/tests'))
    return Promise.resolve(jsonResponse({ tests: baseOverview }));
  if (url.pathname.endsWith('/tests/process'))
    return Promise.resolve(jsonResponse({ process: null }));
  return Promise.resolve(new Response('not found', { status: 404 }));
}

test('apresenta o fluxo guiado e remove comandos detectados e histórico', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = emptyPanelFetch as typeof fetch;

  const wrapper = mount(ProjectTestsPanel, {
    props: { project: makeProject() },
    global: { plugins: [createTestRouter()] },
  });
  cleanup = () => {
    wrapper.unmount();
    globalThis.fetch = originalFetch;
  };
  await flushPromises();
  await flushPromises();

  assert.match(wrapper.text(), /Execução atual/);
  assert.match(wrapper.text(), /Tipo de execução/);
  assert.match(wrapper.text(), /Configure os detalhes/);
  assert.match(wrapper.text(), /Revise e execute/);
  assert.doesNotMatch(wrapper.text(), /Comandos detectados/);
  assert.doesNotMatch(wrapper.text(), /Histórico de execuções/);

  const options = wrapper
    .findAll('.tests-execution-select option')
    .map((option) => option.text());
  assert.ok(
    options.some((option) => option.includes('Vitest — suíte completa')),
  );
  assert.ok(
    options.some((option) => option.includes('Vitest — arquivo específico')),
  );
});

test('executa a suíte selecionada pelo novo seletor', async () => {
  const calls: string[] = [];
  let currentProcess: Record<string, unknown> | null = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost');
    calls.push(url.pathname);
    if (url.pathname.endsWith('/tests'))
      return jsonResponse({ tests: baseOverview });
    if (url.pathname.endsWith('/node-script-test/start')) {
      currentProcess = {
        id: 'node-script-test',
        projectId: 'p1',
        kind: 'test',
        status: 'running',
        command: 'npm',
        args: ['run', 'test'],
        startedAt: '2026-07-27T10:00:00Z',
      };
      return jsonResponse({ process: currentProcess }, 201);
    }
    if (url.pathname.endsWith('/tests/process'))
      return jsonResponse({ process: currentProcess });
    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  const wrapper = mount(ProjectTestsPanel, {
    props: { project: makeProject() },
    global: { plugins: [createTestRouter()] },
  });
  cleanup = () => {
    wrapper.unmount();
    globalThis.fetch = originalFetch;
  };
  await flushPromises();
  await flushPromises();

  assert.equal(
    (wrapper.find('.tests-execution-select').element as HTMLSelectElement)
      .value,
    'node-script-test::suite',
  );
  const executeButton = wrapper
    .findAll('button')
    .find((button) => button.text() === 'Executar agora');
  assert.ok(executeButton);
  await executeButton.trigger('click');
  await flushPromises();

  assert.ok(
    calls.some((path) => path.endsWith('/tests/node-script-test/start')),
  );
  assert.match(wrapper.text(), /Executando|Iniciando/);
});

test('exibe o campo de linha para runners com suporte a caso específico (RSpec) e envia a linha', async () => {
  const calls: Array<{ path: string; body?: unknown }> = [];
  let currentProcess: Record<string, unknown> | null = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    calls.push({
      path: url.pathname,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    if (url.pathname.endsWith('/tests'))
      return jsonResponse({ tests: rspecOverview });
    if (
      url.pathname.endsWith('/files') &&
      !url.pathname.endsWith('/files/start')
    ) {
      return jsonResponse({ files: [{ path: 'spec/models/user_spec.rb' }] });
    }
    if (url.pathname.endsWith('/files/start')) {
      currentProcess = {
        id: 'rspec-suite:file',
        projectId: 'p1',
        kind: 'test',
        status: 'running',
        command: 'bundle',
        args: ['exec', 'rspec', 'spec/models/user_spec.rb:42'],
        startedAt: '2026-07-27T10:00:00Z',
      };
      return jsonResponse({ process: currentProcess }, 201);
    }
    if (url.pathname.endsWith('/tests/process'))
      return jsonResponse({ process: currentProcess });
    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  const wrapper = mount(ProjectTestsPanel, {
    props: { project: makeProject() },
    global: { plugins: [createTestRouter()] },
  });
  cleanup = () => {
    wrapper.unmount();
    globalThis.fetch = originalFetch;
  };
  await flushPromises();
  await flushPromises();

  await wrapper.find('.tests-execution-select').setValue('rspec-suite::file');
  await flushPromises();
  await flushPromises();

  const fileSelect = wrapper.find('.tests-file-select');
  assert.ok(fileSelect.exists());
  await fileSelect.setValue('spec/models/user_spec.rb');

  const lineInput = wrapper.find('.tests-case-line-input');
  assert.ok(lineInput.exists(), 'esperava campo de linha para RSpec');
  await lineInput.setValue('42');

  const executeButton = wrapper
    .findAll('button')
    .find((button) => button.text() === 'Executar agora');
  assert.ok(executeButton);
  await executeButton.trigger('click');
  await flushPromises();

  const startCall = calls.find((call) =>
    call.path.endsWith('/tests/rspec-suite/files/start'),
  );
  assert.ok(startCall);
  assert.deepEqual(startCall.body, {
    path: 'spec/models/user_spec.rb',
    line: 42,
  });
});

test('não mostra o campo de linha para runners sem suporte a caso específico', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = emptyPanelFetch as typeof fetch;

  const wrapper = mount(ProjectTestsPanel, {
    props: { project: makeProject() },
    global: { plugins: [createTestRouter()] },
  });
  cleanup = () => {
    wrapper.unmount();
    globalThis.fetch = originalFetch;
  };
  await flushPromises();
  await flushPromises();

  await wrapper
    .find('.tests-execution-select')
    .setValue('node-script-test::file');
  await flushPromises();
  await flushPromises();

  assert.equal(wrapper.find('.tests-case-line-input').exists(), false);
});

test('carrega arquivos e executa o arquivo escolhido pelo fluxo guiado', async () => {
  const calls: string[] = [];
  let currentProcess: Record<string, unknown> | null = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost');
    calls.push(url.pathname);
    if (url.pathname.endsWith('/tests'))
      return jsonResponse({ tests: baseOverview });
    if (
      url.pathname.endsWith('/files') &&
      !url.pathname.endsWith('/files/start')
    ) {
      return jsonResponse({ files: [{ path: 'src/app.test.ts' }] });
    }
    if (url.pathname.endsWith('/files/start')) {
      currentProcess = {
        id: 'node-script-test:file',
        projectId: 'p1',
        kind: 'test',
        status: 'running',
        command: 'npm',
        args: ['run', 'test', '--', 'src/app.test.ts'],
        startedAt: '2026-07-27T10:00:00Z',
      };
      return jsonResponse({ process: currentProcess }, 201);
    }
    if (url.pathname.endsWith('/tests/process'))
      return jsonResponse({ process: currentProcess });
    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  const wrapper = mount(ProjectTestsPanel, {
    props: { project: makeProject() },
    global: { plugins: [createTestRouter()] },
  });
  cleanup = () => {
    wrapper.unmount();
    globalThis.fetch = originalFetch;
  };
  await flushPromises();
  await flushPromises();

  await wrapper
    .find('.tests-execution-select')
    .setValue('node-script-test::file');
  await flushPromises();
  await flushPromises();

  assert.ok(
    calls.some((path) => path.endsWith('/tests/node-script-test/files')),
  );
  const fileSelect = wrapper.find('.tests-file-select');
  assert.ok(fileSelect.exists());
  await fileSelect.setValue('src/app.test.ts');

  const executeButton = wrapper
    .findAll('button')
    .find((button) => button.text() === 'Executar agora');
  assert.ok(executeButton);
  await executeButton.trigger('click');
  await flushPromises();

  assert.ok(
    calls.some((path) => path.endsWith('/tests/node-script-test/files/start')),
  );
  assert.match(wrapper.text(), /src\/app\.test\.ts/);
});

test('mostra erro específico quando a listagem de arquivos falha', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname.endsWith('/tests'))
      return jsonResponse({ tests: baseOverview });
    if (url.pathname.endsWith('/tests/process'))
      return jsonResponse({ process: null });
    if (url.pathname.endsWith('/files')) {
      return jsonResponse(
        {
          error: 'TEST_COMMAND_NOT_FOUND',
          message: 'Comando de teste não encontrado para este projeto.',
        },
        404,
      );
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  const wrapper = mount(ProjectTestsPanel, {
    props: { project: makeProject() },
    global: { plugins: [createTestRouter()] },
  });
  cleanup = () => {
    wrapper.unmount();
    globalThis.fetch = originalFetch;
  };
  await flushPromises();
  await flushPromises();

  await wrapper
    .find('.tests-execution-select')
    .setValue('node-script-test::file');
  await flushPromises();
  await flushPromises();

  assert.match(wrapper.text(), /Comando de teste não encontrado/);
});

function sseResponse(frames: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const frame of frames) controller.enqueue(encoder.encode(frame));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

test('acompanha a execução em andamento via SSE e atualiza estado e log em tempo real', async () => {
  const originalFetch = globalThis.fetch;
  let currentProcess: Record<string, unknown> = {
    id: 'node-script-test',
    projectId: 'p1',
    kind: 'test',
    status: 'running',
    command: 'npm',
    args: ['run', 'test'],
    startedAt: '2026-07-27T10:00:00Z',
  };
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname.endsWith('/tests'))
      return jsonResponse({ tests: baseOverview });
    if (url.pathname.endsWith('/tests/process/events')) {
      currentProcess = {
        ...currentProcess,
        status: 'stopped',
        stoppedAt: '2026-07-27T10:00:05Z',
        exitCode: 0,
      };
      return sseResponse([
        `event: state\ndata: ${JSON.stringify({ type: 'state', process: currentProcess })}\n\n`,
        `event: log\ndata: ${JSON.stringify({ type: 'log', log: { projectId: 'p1', processId: 'node-script-test', content: 'saída via SSE', sizeBytes: 13, truncated: false, masked: false, redactionCount: 0, readAt: new Date().toISOString() } })}\n\n`,
      ]);
    }
    if (url.pathname.endsWith('/tests/process/logs')) {
      return jsonResponse({
        log: {
          projectId: 'p1',
          processId: 'node-script-test',
          content: 'saída via SSE',
          sizeBytes: 13,
          truncated: false,
          masked: false,
          redactionCount: 0,
          readAt: new Date().toISOString(),
        },
      });
    }
    if (url.pathname.endsWith('/tests/process'))
      return jsonResponse({ process: currentProcess });
    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  const wrapper = mount(ProjectTestsPanel, {
    props: { project: makeProject() },
    global: { plugins: [createTestRouter()] },
  });
  cleanup = () => {
    wrapper.unmount();
    globalThis.fetch = originalFetch;
  };
  for (
    let attempt = 0;
    attempt < 20 && !wrapper.text().includes('Concluído com sucesso');
    attempt += 1
  ) {
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  assert.match(wrapper.text(), /Concluído com sucesso/);
  assert.match(wrapper.text(), /saída via SSE/);
});

test('publica aviso ao receber estado terminal após passar por running', async () => {
  const originalFetch = globalThis.fetch;
  let currentProcess: Record<string, unknown> | null = null;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname === '/api/projects/p1/tests')
      return jsonResponse({ tests: baseOverview });
    if (url.pathname === '/api/projects/p1/tests/node-script-test/start') {
      currentProcess = {
        id: 'node-script-test',
        projectId: 'p1',
        kind: 'test',
        status: 'running',
        command: 'npm',
        args: ['run', 'test'],
        startedAt: '2026-07-27T10:00:00Z',
      };
      return jsonResponse({ process: currentProcess }, 201);
    }
    if (url.pathname === '/api/projects/p1/tests/process/events') {
      currentProcess = {
        ...currentProcess,
        status: 'failed',
        stoppedAt: '2026-07-27T10:00:05Z',
        exitCode: 1,
      };
      return sseResponse([
        `event: state\ndata: ${JSON.stringify({ type: 'state', process: currentProcess })}\n\n`,
      ]);
    }
    if (url.pathname === '/api/projects/p1/tests/process')
      return jsonResponse({ process: currentProcess });
    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  const wrapper = mount(ProjectTestsPanel, {
    props: { project: makeProject() },
    global: { plugins: [createTestRouter()] },
  });
  cleanup = () => {
    wrapper.unmount();
    globalThis.fetch = originalFetch;
  };
  await flushPromises();
  await flushPromises();

  const executeButton = wrapper
    .findAll('button')
    .find((button) => button.text() === 'Executar agora');
  assert.ok(executeButton);
  await executeButton.trigger('click');
  await flushPromises();

  for (
    let attempt = 0;
    attempt < 20 && publishedNotices.size === 0;
    attempt += 1
  ) {
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  assert.equal(
    publishedNotices.size,
    1,
    'deve ter publicado com um dedupeKey único',
  );
  const call = Array.from(publishedNotices.values())[0]!;
  assert.equal(call.origin, 'test');
  assert.equal(call.outcome, 'failed');
  assert.equal(call.projectId, 'p1');
  assert.equal(call.label, 'npm run test');
  assert.equal((call.routeTo as Record<string, unknown>).name, 'project-tests');
  assert.deepEqual((call.routeTo as Record<string, unknown>).params, {
    projectId: 'p1',
  });
});

test('não publica aviso duplicado ao reconectar com o mesmo estado terminal', async () => {
  const originalFetch = globalThis.fetch;
  let currentProcess: Record<string, unknown> | null = null;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname === '/api/projects/p1/tests')
      return jsonResponse({ tests: baseOverview });
    if (url.pathname === '/api/projects/p1/tests/node-script-test/start') {
      currentProcess = {
        id: 'node-script-test',
        projectId: 'p1',
        kind: 'test',
        status: 'running',
        command: 'npm',
        args: ['run', 'test'],
        startedAt: '2026-07-27T10:00:00Z',
      };
      return jsonResponse({ process: currentProcess }, 201);
    }
    if (url.pathname === '/api/projects/p1/tests/process/events') {
      currentProcess = {
        ...currentProcess,
        status: 'failed',
        stoppedAt: '2026-07-27T10:00:05Z',
        exitCode: 1,
      };
      return sseResponse([
        `event: state\ndata: ${JSON.stringify({ type: 'state', process: currentProcess })}\n\n`,
      ]);
    }
    if (url.pathname === '/api/projects/p1/tests/process')
      return jsonResponse({ process: currentProcess });
    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  const wrapper = mount(ProjectTestsPanel, {
    props: { project: makeProject() },
    global: { plugins: [createTestRouter()] },
  });
  cleanup = () => {
    wrapper.unmount();
    globalThis.fetch = originalFetch;
  };
  await flushPromises();
  await flushPromises();

  const executeButton = wrapper
    .findAll('button')
    .find((button) => button.text() === 'Executar agora');
  assert.ok(executeButton);
  await executeButton.trigger('click');
  await flushPromises();

  for (
    let attempt = 0;
    attempt < 20 && publishedNotices.size === 0;
    attempt += 1
  ) {
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  const noticesAfterFirstTerminal = publishedNotices.size;
  assert.equal(noticesAfterFirstTerminal, 1);

  for (let attempt = 0; attempt < 50; attempt += 1) {
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  assert.equal(publishedNotices.size, noticesAfterFirstTerminal);
});

test('não publica aviso quando processo já chega parado na primeira renderização', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname === '/api/projects/p1/tests')
      return jsonResponse({ tests: baseOverview });
    if (url.pathname === '/api/projects/p1/tests/process') {
      return jsonResponse({
        process: {
          id: 'node-script-test',
          projectId: 'p1',
          kind: 'test',
          status: 'stopped',
          command: 'npm',
          args: ['run', 'test'],
          startedAt: '2026-07-27T09:00:00Z',
          stoppedAt: '2026-07-27T09:00:05Z',
          exitCode: 0,
        },
      });
    }
    if (url.pathname.endsWith('/tests/process/logs')) {
      return jsonResponse({
        log: {
          projectId: 'p1',
          processId: 'node-script-test',
          content: '',
          sizeBytes: 0,
          truncated: false,
          masked: false,
          redactionCount: 0,
          readAt: new Date().toISOString(),
        },
      });
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  const wrapper = mount(ProjectTestsPanel, {
    props: { project: makeProject() },
    global: { plugins: [createTestRouter()] },
  });
  cleanup = () => {
    wrapper.unmount();
    globalThis.fetch = originalFetch;
  };

  for (let attempt = 0; attempt < 20; attempt += 1) {
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  assert.equal(publishedNotices.size, 0);
});
