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
  enabled: true,
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
        environment: input.environment === null ? undefined : input.environment,
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

  it('seleciona um .env conhecido, confirma o uso e persiste antes do start', async () => {
    const wrapper = mount(ProjectServerPanel, {
      props: { project },
    });
    await flushPromises();
    await wrapper.get('.server-settings-toggle').trigger('click');

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
        message: expect.stringContaining('não serão alterados'),
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

  it('permite voltar ao ambiente padrão e iniciar sem exigir outro .env.*', async () => {
    const wrapper = mount(ProjectServerPanel, {
      props: { project },
    });
    await flushPromises();
    await wrapper.get('.server-settings-toggle').trigger('click');

    const select = wrapper.get<HTMLSelectElement>('.server-environment-select');
    const defaultOption = select.find('option[value=""]');
    expect(defaultOption.exists()).toBe(true);
    expect(defaultOption.attributes('disabled')).toBeUndefined();
    expect(defaultOption.text()).toContain('Padrão');

    await select.setValue('');

    const startButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Iniciar'));
    expect(startButton).toBeDefined();
    expect(startButton!.attributes('disabled')).toBeUndefined();

    await startButton!.trigger('click');
    await flushPromises();

    expect(confirmDialog).not.toHaveBeenCalled();
    expect(saveProjectServerSettings).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({ environment: null }),
    );
    expect(startProjectProcess).toHaveBeenCalledWith('p1', { port: null });

    wrapper.unmount();
  });
});
