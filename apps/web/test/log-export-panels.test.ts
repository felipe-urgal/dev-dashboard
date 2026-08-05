import assert from 'node:assert/strict';
import { afterEach, beforeEach, test, vi } from 'vitest';

import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils';

import type {
  ManagedProcess,
  ProcessLogSnapshot,
  ProjectScriptCatalog,
  ProjectTestOverview,
  ScriptExecution,
  ScriptExecutionLog,
} from '@dev-dashboard/contracts';

const mocks = vi.hoisted(() => ({
  exportLogSnapshot: vi.fn((_options: unknown) => true),
  publishTerminalNotice: vi.fn(),
  serverProcess: null as ManagedProcess | null,
  serverSnapshot: null as ProcessLogSnapshot | null,
}));

vi.mock('../src/utils/log-export', () => ({
  exportLogSnapshot: mocks.exportLogSnapshot,
}));

vi.mock('../src/stores/notice-center', () => ({
  noticeCenterStore: {
    publishTerminalNotice: mocks.publishTerminalNotice,
  },
}));

vi.mock('../src/composables/useProjectProcessStatus', async () => {
  const { computed, ref } = await import('vue');
  return {
    useProjectProcessStatus: () => {
      const managedProcess = ref(mocks.serverProcess);
      const processStatus = computed(() => managedProcess.value?.status ?? 'idle');
      return {
        managedProcess,
        loadingStatus: ref(false),
        errorMessage: ref(''),
        supportsServer: computed(() => true),
        processStatus,
        hasManagedProcess: computed(() => Boolean(managedProcess.value)),
        statusLabel: computed(() => processStatus.value === 'running' ? 'Em execução' : 'Parado'),
      };
    },
  };
});

vi.mock('../src/composables/useProjectLogsPolling', async () => {
  const { ref } = await import('vue');
  return {
    useProjectLogsPolling: () => ({
      loadingLogs: ref(false),
      logSnapshot: ref(mocks.serverSnapshot),
      logErrorMessage: ref(''),
      followLogs: ref(true),
      streamPaused: ref(false),
      refreshLogs: vi.fn(),
      scrollLogsToLatest: vi.fn(async () => undefined),
      handleLogScroll: vi.fn(),
      clearLogView: vi.fn(),
      toggleStream: vi.fn(),
    }),
  };
});

import ProjectLogsPanel from '../src/components/ProjectLogsPanel.vue';
import ProjectScriptsPanel from '../src/components/ProjectScriptsPanel.vue';
import ProjectTestsPanel from '../src/components/ProjectTestsPanel.vue';
import { makeProject } from './support/activity-fixtures.js';
import { createTestRouter } from './support/test-router';

let cleanup: (() => void) | undefined;

beforeEach(() => {
  cleanup = undefined;
  mocks.exportLogSnapshot.mockClear();
  mocks.publishTerminalNotice.mockClear();
  mocks.serverProcess = null;
  mocks.serverSnapshot = null;
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

function exportButton(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll('button').find((button) => /Exportar(?: log)?/.test(button.text()));
}

test('servidor exporta o snapshot mascarado já carregado', async () => {
  const process: ManagedProcess = {
    id: 'server-1',
    projectId: 'p1',
    kind: 'server',
    status: 'running',
    pid: 4242,
    port: 3000,
    command: 'bin/rails s',
    startedAt: '2026-08-04T20:59:00.000Z',
  };
  const snapshot: ProcessLogSnapshot = {
    projectId: 'p1', processId: 'server-1',
    content: 'token=[CONTEUDO_MASCARADO]', sizeBytes: 28,
    truncated: true, masked: true, redactionCount: 1,
    readAt: '2026-08-04T21:00:00.000Z',
  };
  mocks.serverProcess = process;
  mocks.serverSnapshot = snapshot;

  const wrapper = mount(ProjectLogsPanel, {
    props: { project: makeProject({ id: 'p1', type: 'rails', capabilities: ['server'] }) },
    global: { stubs: { RouterLink: RouterLinkStub } },
  });
  cleanup = () => wrapper.unmount();
  await flushPromises();

  const button = exportButton(wrapper);
  assert.ok(button);
  assert.equal(button.attributes('disabled'), undefined);
  await button.trigger('click');

  assert.equal(mocks.exportLogSnapshot.mock.calls.length, 1);
  assert.deepEqual(mocks.exportLogSnapshot.mock.calls[0]![0], {
    projectName: 'sample-node',
    origin: 'servidor',
    identifier: 'server-1',
    capturedAt: '2026-08-04T21:00:00.000Z',
    snapshot,
  });
  assert.doesNotMatch(snapshot.content, /segredo-original/);
});

test('testes exportam o snapshot atual sem nova leitura', async () => {
  const originalFetch = globalThis.fetch;
  const overview: ProjectTestOverview = {
    supported: true,
    commands: [{
      id: 'node-script-test', runner: 'vitest', label: 'npm run test',
      description: 'Executa testes', origin: 'package-script', originDetail: 'scripts.test',
      priority: 10, supportsFileTarget: true,
    }],
  };
  const process: ManagedProcess = {
    id: 'test-1', projectId: 'p1', kind: 'test', status: 'failed',
    command: 'npm', args: ['run', 'test'], exitCode: 1,
  };
  const snapshot: ProcessLogSnapshot = {
    projectId: 'p1', processId: 'test-1',
    content: 'password=[CONTEUDO_MASCARADO]', sizeBytes: 32,
    truncated: false, masked: true, redactionCount: 1,
    readAt: '2026-08-04T21:01:00.000Z',
  };
  let logReads = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const path = new URL(String(input), 'http://localhost').pathname;
    if (path === '/api/projects/p1/tests') return jsonResponse({ tests: overview });
    if (path === '/api/projects/p1/tests/process') return jsonResponse({ process });
    if (path === '/api/projects/p1/tests/process/logs') {
      logReads += 1;
      return jsonResponse({ log: snapshot });
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  const wrapper = mount(ProjectTestsPanel, {
    props: { project: makeProject({ id: 'p1', capabilities: ['tests'] }) },
    global: { plugins: [createTestRouter()] },
  });
  cleanup = () => {
    wrapper.unmount();
    globalThis.fetch = originalFetch;
  };
  await flushPromises();
  await flushPromises();

  const readsBeforeExport = logReads;
  const button = exportButton(wrapper);
  assert.ok(button);
  await button.trigger('click');

  assert.equal(logReads, readsBeforeExport);
  assert.deepEqual(mocks.exportLogSnapshot.mock.calls[0]![0], {
    projectName: 'sample-node',
    origin: 'testes',
    identifier: 'test-1',
    capturedAt: '2026-08-04T21:01:00.000Z',
    snapshot,
  });
});

test('scripts exportam o snapshot selecionado do histórico', async () => {
  const originalFetch = globalThis.fetch;
  const execution: ScriptExecution = {
    id: 'exec-script', projectId: 'p1', actionId: 'npm-run-build',
    actionName: 'npm run build', risk: 'read-only', status: 'succeeded',
    startedAt: '2026-08-04T20:00:00.000Z',
    finishedAt: '2026-08-04T20:00:02.000Z', exitCode: 0,
  };
  const snapshot: ScriptExecutionLog = {
    executionId: 'exec-script',
    content: 'Bearer [CONTEUDO_MASCARADO]',
    truncated: false, masked: true, redactionCount: 1,
  };
  const catalog: ProjectScriptCatalog = {
    items: [{
      id: 'npm-run-build', name: 'npm run build', description: 'Compila o projeto',
      command: 'npm run build', origin: 'package-script', risk: 'read-only', enabled: true,
    }],
    page: 1, pageSize: 12, total: 1, totalPages: 1,
  };
  let logReads = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const path = new URL(String(input), 'http://localhost').pathname;
    if (path === '/api/projects/p1/scripts/executions/latest') return jsonResponse({ execution });
    if (path === '/api/projects/p1/scripts/executions/exec-script/log') {
      logReads += 1;
      return jsonResponse({ log: snapshot });
    }
    if (path === '/api/projects/p1/scripts/executions/exec-script') return jsonResponse({ execution });
    if (path === '/api/projects/p1/scripts/executions') {
      return jsonResponse({ history: { items: [execution], page: 1, pageSize: 10, total: 1, totalPages: 1 } });
    }
    if (path === '/api/projects/p1/scripts') return jsonResponse({ catalog });
    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  const wrapper = mount(ProjectScriptsPanel, {
    props: { project: makeProject({ id: 'p1', capabilities: ['scripts'] }) },
  });
  cleanup = () => {
    wrapper.unmount();
    globalThis.fetch = originalFetch;
  };
  await flushPromises();
  await flushPromises();

  const executionsTab = wrapper.findAll('[role="tab"]').find((tab) => tab.text() === 'Execuções');
  assert.ok(executionsTab);
  await executionsTab.trigger('click');
  await flushPromises();

  const readsBeforeExport = logReads;
  const button = exportButton(wrapper);
  assert.ok(button);
  await button.trigger('click');

  assert.equal(logReads, readsBeforeExport);
  assert.deepEqual(mocks.exportLogSnapshot.mock.calls[0]![0], {
    projectName: 'sample-node',
    origin: 'script',
    identifier: 'exec-script',
    snapshot,
  });
});
