import { flushPromises, mount } from '@vue/test-utils';
import { computed, ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ManagedProcess, Project } from '@dev-dashboard/contracts';

const fetchProjectServerConfiguration = vi.hoisted(() => vi.fn());
const saveProjectServerSettings = vi.hoisted(() => vi.fn());
const startProjectProcess = vi.hoisted(() => vi.fn());
const stopProjectProcess = vi.hoisted(() => vi.fn());
const openProjectBrowserTarget = vi.hoisted(() => vi.fn());
const confirmDialog = vi.hoisted(() => vi.fn());

vi.mock('../src/api', () => ({
  fetchProjectServerConfiguration,
  saveProjectServerSettings,
  startProjectProcess,
  stopProjectProcess,
  openProjectBrowserTarget,
}));

vi.mock('../src/stores/app-dialog', () => ({ confirmDialog }));

vi.mock('../src/composables/useProjectProcessStatus', () => ({
  useProjectProcessStatus: () => {
    const managedProcess = ref<ManagedProcess | null>(null);
    const processStatus = ref<'stopped'>('stopped');
    return {
      managedProcess,
      loadingStatus: ref(false),
      errorMessage: ref(''),
      supportsServer: computed(() => true),
      processStatus,
      canStop: computed(() => false),
      statusLabel: computed(() => 'Parado'),
      scheduleProcessPolling: vi.fn(),
    };
  },
}));

vi.mock('../src/composables/useProjectServerHealth', () => ({
  useProjectServerHealth: () => ({
    health: ref(null),
    healthCheckedAtLabel: computed(() => '—'),
    healthError: ref(''),
    healthLabel: computed(() => 'Não verificado'),
    loadingHealth: ref(false),
    refreshHealth: vi.fn(),
    resetHealth: vi.fn(),
  }),
}));

vi.mock('../src/composables/useProjectServerMetrics', () => ({
  useProjectServerMetrics: () => ({
    commandLabel: computed(() => 'npm run dev'),
    startedAtLabel: computed(() => '—'),
    uptimeLabel: computed(() => '—'),
  }),
}));

import ProjectServerPanel from '../src/components/ProjectServerPanel.vue';

const project: Project = {
  id: 'p1',
  name: 'frontend',
  path: '/tmp/frontend',
  type: 'node',
  source: 'workspace',
  workspaceId: 'w1',
  favorite: false,
  capabilities: ['server'],
};

describe('ambiente do servidor Node', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchProjectServerConfiguration.mockResolvedValue({
      settings: {
        projectId: 'p1',
        environment: 'staging',
      },
      environments: ['development', 'staging'],
    });
    saveProjectServerSettings.mockImplementation(
      async (_projectId: string, input: Record<string, unknown>) => ({
        projectId: 'p1',
        ...input,
      }),
    );
    startProjectProcess.mockResolvedValue({
      id: 'p1:server',
      projectId: 'p1',
      kind: 'server',
      status: 'starting',
    });
    confirmDialog.mockResolvedValue(true);
  });

  it('seleciona um .env conhecido, confirma a cópia e persiste antes do start', async () => {
    const wrapper = mount(ProjectServerPanel, {
      props: { project },
    });
    await flushPromises();

    const select = wrapper.get<HTMLSelectElement>('.server-environment-select');
    expect(select.element.value).toBe('staging');
    await select.setValue('development');

    const startButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Iniciar'));
    expect(startButton).toBeDefined();
    await startButton!.trigger('click');
    await flushPromises();

    expect(confirmDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Usar .env.development?',
      }),
    );
    expect(saveProjectServerSettings).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({
        environment: 'development',
      }),
    );
    expect(startProjectProcess).toHaveBeenCalledWith('p1', { port: null });

    wrapper.unmount();
  });
});
