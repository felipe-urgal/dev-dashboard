import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ManagedProcess,
  Project,
  RailsWorkerId,
} from '@dev-dashboard/contracts';

const {
  fetchProjectProcess,
  startProjectProcess,
  stopProjectProcess,
  fetchProjectRailsWorker,
  startProjectRailsWorker,
  stopProjectRailsWorker,
} = vi.hoisted(() => ({
  fetchProjectProcess: vi.fn(),
  startProjectProcess: vi.fn(),
  stopProjectProcess: vi.fn(),
  fetchProjectRailsWorker: vi.fn(),
  startProjectRailsWorker: vi.fn(),
  stopProjectRailsWorker: vi.fn(),
}));

vi.mock('../src/api', () => ({
  fetchProjectProcess,
  startProjectProcess,
  stopProjectProcess,
  fetchProjectRailsWorker,
  startProjectRailsWorker,
  stopProjectRailsWorker,
}));

import ProjectProcessesMenu from '../src/components/ProjectProcessesMenu.vue';

const railsProject: Project = {
  id: 'p1',
  workspaceId: 'w1',
  name: 'fi-editor',
  path: '/projetos/fi-editor',
  type: 'rails',
  source: 'workspace',
  favorite: false,
  enabled: true,
  capabilities: ['server', 'sidekiq', 'webpack'],
};

const nodeProjectNoServer: Project = {
  id: 'p2',
  workspaceId: 'w1',
  name: 'sem-servidor',
  path: '/projetos/sem-servidor',
  type: 'node',
  source: 'workspace',
  favorite: false,
  enabled: true,
  capabilities: ['git'],
};

const railsProjectNoWorkers: Project = {
  ...railsProject,
  id: 'p3',
  name: 'rails-sem-workers',
  capabilities: ['server'],
};

function serverProcess(status: ManagedProcess['status']): ManagedProcess {
  return {
    id: 'p1:server',
    projectId: 'p1',
    kind: 'server',
    status,
    pid: 111,
    startedAt: '2026-08-07T12:00:00.000Z',
  };
}

function workerOverview(workerId: RailsWorkerId, running: boolean) {
  return {
    id: workerId,
    detected: true,
    process: running
      ? {
          id: `p1:${workerId}`,
          projectId: 'p1',
          kind: workerId === 'sidekiq' ? 'worker' : 'webpack',
          status: 'running' as const,
          pid: 222,
          startedAt: '2026-08-07T12:00:00.000Z',
        }
      : null,
  };
}

describe('ProjectProcessesMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchProjectProcess.mockResolvedValue(serverProcess('running'));
    fetchProjectRailsWorker.mockImplementation(
      async (_projectId: string, workerId: RailsWorkerId) =>
        workerOverview(workerId, workerId === 'sidekiq'),
    );
  });

  it('não renderiza nada quando o projeto não tem capability de servidor', async () => {
    const wrapper = mount(ProjectProcessesMenu, {
      props: { project: nodeProjectNoServer },
    });

    await flushPromises();

    expect(wrapper.find('.processes-menu-trigger').exists()).toBe(false);
    expect(fetchProjectProcess).not.toHaveBeenCalled();
    expect(fetchProjectRailsWorker).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it('não consulta workers que o projeto Rails não suporta', async () => {
    const wrapper = mount(ProjectProcessesMenu, {
      props: { project: railsProjectNoWorkers },
    });

    await flushPromises();

    expect(fetchProjectProcess).toHaveBeenCalledWith('p3');
    expect(fetchProjectRailsWorker).not.toHaveBeenCalled();
    expect(wrapper.find('.processes-menu-trigger').exists()).toBe(true);

    wrapper.unmount();
  });

  it('lista servidor e sidekiq rodando e mostra a contagem no botão', async () => {
    const wrapper = mount(ProjectProcessesMenu, {
      props: { project: railsProject },
    });

    await flushPromises();

    expect(wrapper.find('.processes-menu-count').text()).toBe('2');

    await wrapper.find('.processes-menu-trigger').trigger('click');
    await flushPromises();

    const itemNames = wrapper.findAll('.processes-menu-item-name');
    expect(itemNames.map((el) => el.text())).toEqual([
      'Servidor',
      'Sidekiq',
      'Webpack',
    ]);

    const actions = wrapper.findAll('.processes-menu-item-action');
    expect(actions[0]?.text()).toBe('Parar');
    expect(actions[1]?.text()).toBe('Parar');
    expect(actions[2]?.text()).toBe('Iniciar');

    wrapper.unmount();
  });

  it('para um processo individual pelo botão da linha', async () => {
    stopProjectProcess.mockResolvedValueOnce(serverProcess('stopped'));

    const wrapper = mount(ProjectProcessesMenu, {
      props: { project: railsProject },
    });

    await flushPromises();
    await wrapper.find('.processes-menu-trigger').trigger('click');
    await flushPromises();

    await wrapper.findAll('.processes-menu-item-action')[0]?.trigger('click');
    await flushPromises();

    expect(stopProjectProcess).toHaveBeenCalledWith('p1');
    expect(wrapper.find('.processes-menu-count').text()).toBe('1');

    wrapper.unmount();
  });

  it('"Parar tudo" para todos os processos em execução', async () => {
    stopProjectProcess.mockResolvedValueOnce(serverProcess('stopped'));
    stopProjectRailsWorker.mockResolvedValueOnce({
      id: 'p1:worker',
      projectId: 'p1',
      kind: 'worker',
      status: 'stopped',
    });

    const wrapper = mount(ProjectProcessesMenu, {
      props: { project: railsProject },
    });

    await flushPromises();
    await wrapper.find('.processes-menu-trigger').trigger('click');
    await flushPromises();

    await wrapper
      .find('.processes-menu-bulk .menu-item.danger')
      .trigger('click');
    await flushPromises();

    expect(stopProjectProcess).toHaveBeenCalledWith('p1');
    expect(stopProjectRailsWorker).toHaveBeenCalledWith('p1', 'sidekiq');
    expect(wrapper.find('.processes-menu-count').exists()).toBe(false);

    wrapper.unmount();
  });

  it('"Iniciar tudo" inicia todos os processos parados', async () => {
    fetchProjectProcess.mockResolvedValue(serverProcess('stopped'));
    fetchProjectRailsWorker.mockImplementation(
      async (_projectId: string, workerId: RailsWorkerId) =>
        workerOverview(workerId, false),
    );
    startProjectProcess.mockResolvedValueOnce(serverProcess('running'));
    startProjectRailsWorker.mockResolvedValue({
      id: 'p1:worker',
      projectId: 'p1',
      kind: 'worker',
      status: 'running',
    });

    const wrapper = mount(ProjectProcessesMenu, {
      props: { project: railsProject },
    });

    await flushPromises();
    await wrapper.find('.processes-menu-trigger').trigger('click');
    await flushPromises();

    const startAllButton = wrapper.findAll(
      '.processes-menu-bulk .menu-item',
    )[0];
    await startAllButton?.trigger('click');
    await flushPromises();

    expect(startProjectProcess).toHaveBeenCalledWith('p1');
    expect(startProjectRailsWorker).toHaveBeenCalledWith('p1', 'sidekiq');
    expect(startProjectRailsWorker).toHaveBeenCalledWith('p1', 'webpack');

    wrapper.unmount();
  });
});
