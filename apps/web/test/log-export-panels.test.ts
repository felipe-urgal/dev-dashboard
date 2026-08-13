import assert from 'node:assert/strict';
import { afterEach, beforeEach, test, vi } from 'vitest';

import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils';

import type {
  ManagedProcess,
  ProcessLogSnapshot,
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
      const processStatus = computed(
        () => managedProcess.value?.status ?? 'idle',
      );
      return {
        managedProcess,
        loadingStatus: ref(false),
        errorMessage: ref(''),
        supportsServer: computed(() => true),
        processStatus,
        hasManagedProcess: computed(() => Boolean(managedProcess.value)),
        statusLabel: computed(() =>
          processStatus.value === 'running' ? 'Em execução' : 'Parado',
        ),
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
import { makeProject } from './support/activity-fixtures.js';

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

function exportButton(wrapper: ReturnType<typeof mount>) {
  return wrapper
    .findAll('button')
    .find((button) => /Exportar(?: log)?/.test(button.text()));
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
    projectId: 'p1',
    processId: 'server-1',
    content: 'token=[CONTEUDO_MASCARADO]',
    sizeBytes: 28,
    truncated: true,
    masked: true,
    redactionCount: 1,
    readAt: '2026-08-04T21:00:00.000Z',
  };
  mocks.serverProcess = process;
  mocks.serverSnapshot = snapshot;

  const wrapper = mount(ProjectLogsPanel, {
    props: {
      project: makeProject({
        id: 'p1',
        type: 'rails',
        capabilities: ['server'],
      }),
    },
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
