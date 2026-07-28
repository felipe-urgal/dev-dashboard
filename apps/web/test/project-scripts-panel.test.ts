import assert from 'node:assert/strict';
import { afterEach, beforeEach, test, vi } from 'vitest';

import { mount, flushPromises } from '@vue/test-utils';

import type { ProjectScriptCatalog, ScriptExecution } from '@dev-dashboard/contracts';

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

let cleanup: (() => void) | undefined;

beforeEach(() => {
  cleanup = undefined;
  mocks.publishTerminalNotice.mockClear();
});

afterEach(() => {
  cleanup?.();
});

test('montagem básica renderiza catálogo sem erros', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname.endsWith('/scripts')) {
      return new Response(JSON.stringify({ catalog: baseCatalog }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url.pathname.endsWith('/scripts/execution')) {
      return new Response(JSON.stringify({ execution: null }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url.pathname.endsWith('/scripts/history')) {
      return new Response(
        JSON.stringify({ history: { items: [], page: 1, pageSize: 10, total: 0, totalPages: 0 } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  const wrapper = mount(ProjectScriptsPanel, { props: { project: makeProject() } });
  cleanup = () => {
    wrapper.unmount();
    globalThis.fetch = originalFetch;
  };

  await flushPromises();
  await flushPromises();

  const scripts = wrapper.findAll('.script-card');
  assert.equal(scripts.length, 2);
  assert.match(wrapper.text(), /npm run test/);
  assert.match(wrapper.text(), /npm run build/);
});

test('transição de running para succeeded publica aviso', async () => {
  const originalFetch = globalThis.fetch;
  let currentExecution: ScriptExecution | null = null;
  let statePhase = 'initial'; // initial -> running -> succeeded

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname.endsWith('/scripts')) {
      return new Response(JSON.stringify({ catalog: baseCatalog }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url.pathname.endsWith('/scripts/execution')) {
      return new Response(JSON.stringify({ execution: currentExecution }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url.pathname.endsWith('/scripts/execution/logs')) {
      return new Response(
        JSON.stringify({
          log: {
            executionId: currentExecution?.id || 'exec-123',
            content: 'test output',
            truncated: false,
            masked: false,
            redactionCount: 0,
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    if (url.pathname.endsWith('/scripts/history')) {
      return new Response(
        JSON.stringify({ history: { items: [], page: 1, pageSize: 10, total: 0, totalPages: 0 } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  const wrapper = mount(ProjectScriptsPanel, { props: { project: makeProject() } });
  cleanup = () => {
    wrapper.unmount();
    globalThis.fetch = originalFetch;
  };

  // Load initial state with no execution
  await flushPromises();
  await flushPromises();

  // Simulate execution starting
  statePhase = 'running';
  currentExecution = {
    id: 'exec-123',
    projectId: 'p1',
    actionId: 'npm-run-test',
    actionName: 'npm run test',
    status: 'running',
    risk: 'read-only',
    startedAt: '2026-07-28T10:00:00Z',
  };
  // Manually trigger the watch by updating the ref
  (wrapper.vm as any).execution = currentExecution;
  await wrapper.vm.$nextTick();
  await flushPromises();

  // Simulate execution completing
  statePhase = 'succeeded';
  currentExecution = {
    ...currentExecution,
    status: 'succeeded',
    finishedAt: '2026-07-28T10:00:05Z',
  };
  (wrapper.vm as any).execution = currentExecution;
  await wrapper.vm.$nextTick();
  await flushPromises();

  assert.equal(mocks.publishTerminalNotice.mock.calls.length, 1);
  const call = mocks.publishTerminalNotice.mock.calls[0]![0];
  assert.equal(call.origin, 'script');
  assert.equal(call.outcome, 'succeeded');
  assert.equal(call.projectId, 'p1');
  assert.equal(call.projectName, 'sample-node');
  assert.equal(call.label, 'npm run test');
  assert.deepEqual(call.routeTo, { name: 'project-scripts', params: { projectId: 'p1' } });
});

test('execução que chega terminal sem nunca ter sido observada running não gera aviso', async () => {
  const originalFetch = globalThis.fetch;
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

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname.endsWith('/scripts')) {
      return new Response(JSON.stringify({ catalog: baseCatalog }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url.pathname.endsWith('/scripts/execution')) {
      return new Response(JSON.stringify({ execution: terminalExecution }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url.pathname.endsWith('/scripts/execution/logs')) {
      return new Response(
        JSON.stringify({
          log: {
            executionId: 'exec-456',
            content: 'build failed',
            truncated: false,
            masked: false,
            redactionCount: 0,
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    if (url.pathname.endsWith('/scripts/history')) {
      return new Response(
        JSON.stringify({ history: { items: [], page: 1, pageSize: 10, total: 0, totalPages: 0 } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  const wrapper = mount(ProjectScriptsPanel, { props: { project: makeProject() } });
  cleanup = () => {
    wrapper.unmount();
    globalThis.fetch = originalFetch;
  };

  await flushPromises();
  await flushPromises();

  assert.equal(mocks.publishTerminalNotice.mock.calls.length, 0);
});
