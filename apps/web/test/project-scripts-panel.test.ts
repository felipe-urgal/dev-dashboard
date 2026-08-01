import assert from 'node:assert/strict';
import { afterEach, beforeEach, test, vi } from 'vitest';

import { mount, flushPromises } from '@vue/test-utils';

import type { ProjectScriptCatalog, ScriptExecution, ScriptExecutionEvent } from '@dev-dashboard/contracts';

const mocks = vi.hoisted(() => ({
  publishTerminalNotice: vi.fn(),
}));

vi.mock('../src/stores/notice-center', () => ({
  noticeCenterStore: {
    publishTerminalNotice: mocks.publishTerminalNotice,
  },
}));

import ProjectScriptsPanel from '../src/components/ProjectScriptsPanel.vue';
import { makeProject } from './support/activity-fixtures.js';

const baseCatalog: ProjectScriptCatalog = {
  items: [
    {
      id: 'npm-run-test',
      name: 'npm run test',
      description: 'Executa testes unitários',
      command: 'npm run test',
      origin: 'package-script',
      risk: 'read-only',
      enabled: true,
    },
    {
      id: 'npm-run-build',
      name: 'npm run build',
      description: 'Compila o projeto',
      command: 'npm run build',
      origin: 'package-script',
      risk: 'read-only',
      enabled: true,
    },
  ],
  page: 1,
  pageSize: 12,
  total: 2,
  totalPages: 1,
};

const emptyHistory = { items: [], page: 1, pageSize: 10, total: 0, totalPages: 0 };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function sseResponse(events: ScriptExecutionEvent[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

interface FetchScenario {
  latestExecution: ScriptExecution | null;
  catalog?: ProjectScriptCatalog;
  executionsById?: Record<string, ScriptExecution>;
  sseEvents?: ScriptExecutionEvent[];
}

function installFetchMock(scenario: FetchScenario): () => void {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost');
    const path = url.pathname;

    if (path.endsWith('/scripts/executions/latest')) {
      return jsonResponse({ execution: scenario.latestExecution });
    }
    if (path.endsWith('/log')) {
      return jsonResponse({
        log: { executionId: 'exec', content: 'saída', truncated: false, masked: false, redactionCount: 0 },
      });
    }
    if (path.endsWith('/events')) {
      return sseResponse(scenario.sseEvents ?? []);
    }
    const executionMatch = path.match(/\/scripts\/executions\/([^/]+)$/);
    if (executionMatch) {
      const execution = scenario.executionsById?.[executionMatch[1]!];
      if (execution) return jsonResponse({ execution });
      return new Response('not found', { status: 404 });
    }
    if (path.endsWith('/scripts/executions')) {
      return jsonResponse({ history: emptyHistory });
    }
    if (path.endsWith('/scripts')) {
      return jsonResponse({ catalog: scenario.catalog ?? baseCatalog });
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  return () => {
    globalThis.fetch = originalFetch;
  };
}

let cleanup: (() => void) | undefined;

beforeEach(() => {
  cleanup = undefined;
  mocks.publishTerminalNotice.mockClear();
});

afterEach(() => {
  cleanup?.();
});

test('montagem básica renderiza catálogo sem erros', async () => {
  const restoreFetch = installFetchMock({ latestExecution: null });

  const wrapper = mount(ProjectScriptsPanel, { props: { project: makeProject() } });
  cleanup = () => {
    wrapper.unmount();
    restoreFetch();
  };

  await flushPromises();
  await flushPromises();

  const scripts = wrapper.findAll('.script-card');
  assert.equal(scripts.length, 2);
  assert.match(wrapper.text(), /npm run test/);
  assert.match(wrapper.text(), /npm run build/);
});

test('catálogo remove hooks e direciona comandos cobertos por outras áreas', async () => {
  const catalog: ProjectScriptCatalog = {
    ...baseCatalog,
    items: [
      ...baseCatalog.items,
      { ...baseCatalog.items[0]!, id: 'npm-run-dev', name: 'dev', command: 'npm run dev' },
      { ...baseCatalog.items[0]!, id: 'npm-run-postbuild', name: 'postbuild', command: 'npm run postbuild' },
      { ...baseCatalog.items[0]!, id: 'npm-run-lint', name: 'lint', command: 'npm run lint' },
    ],
    total: 5,
  };
  const restoreFetch = installFetchMock({ latestExecution: null, catalog });
  const project = makeProject({ capabilities: ['scripts', 'server', 'tests'] });
  const wrapper = mount(ProjectScriptsPanel, { props: { project } });
  cleanup = () => {
    wrapper.unmount();
    restoreFetch();
  };

  await flushPromises();
  await flushPromises();

  assert.deepEqual(
    wrapper.findAll('.script-card h4').map((item) => item.text()),
    ['npm run build', 'lint'],
  );
  assert.match(wrapper.text(), /3 comandos foram direcionados/);
});

test('transição de running para succeeded via SSE publica aviso uma única vez', async () => {
  const runningExecution: ScriptExecution = {
    id: 'exec-123',
    projectId: 'p1',
    actionId: 'npm-run-test',
    actionName: 'npm run test',
    status: 'running',
    risk: 'read-only',
    startedAt: '2026-07-28T10:00:00Z',
  };
  const succeededExecution: ScriptExecution = {
    ...runningExecution,
    status: 'succeeded',
    finishedAt: '2026-07-28T10:00:05Z',
    exitCode: 0,
  };

  const restoreFetch = installFetchMock({
    latestExecution: runningExecution,
    executionsById: { 'exec-123': runningExecution },
    sseEvents: [{ type: 'state', execution: succeededExecution }],
  });

  const wrapper = mount(ProjectScriptsPanel, { props: { project: makeProject() } });
  cleanup = () => {
    wrapper.unmount();
    restoreFetch();
  };

  await flushPromises();
  await flushPromises();
  await flushPromises();

  assert.equal(mocks.publishTerminalNotice.mock.calls.length, 1);
  const call = mocks.publishTerminalNotice.mock.calls[0]![0];
  assert.equal(call.origin, 'script');
  assert.equal(call.dedupeKey, 'script:exec-123:succeeded');
  assert.equal(call.outcome, 'succeeded');
  assert.equal(call.projectId, 'p1');
  assert.equal(call.projectName, 'sample-node');
  assert.equal(call.label, 'npm run test');
  assert.deepEqual(call.routeTo, { name: 'project-scripts', params: { projectId: 'p1' } });
});

test('execução que chega terminal sem nunca ter sido observada running não gera aviso', async () => {
  const terminalExecution: ScriptExecution = {
    id: 'exec-456',
    projectId: 'p1',
    actionId: 'npm-run-build',
    actionName: 'npm run build',
    status: 'failed',
    risk: 'read-only',
    startedAt: '2026-07-28T10:00:00Z',
    finishedAt: '2026-07-28T10:00:05Z',
    exitCode: 1,
  };

  const restoreFetch = installFetchMock({
    latestExecution: terminalExecution,
    executionsById: { 'exec-456': terminalExecution },
  });

  const wrapper = mount(ProjectScriptsPanel, { props: { project: makeProject() } });
  cleanup = () => {
    wrapper.unmount();
    restoreFetch();
  };

  await flushPromises();
  await flushPromises();
  await flushPromises();

  // Prova de que a execução terminal chegou ao componente (não um 404 mascarado):
  // o aside de execução exibe "npm run build · Falhou".
  assert.match(wrapper.text(), /npm run build · Falhou/);
  assert.equal(mocks.publishTerminalNotice.mock.calls.length, 0);
});
