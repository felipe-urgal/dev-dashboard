import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  Project,
  RailsWorkerId,
  RailsWorkerOverview,
} from '@dev-dashboard/contracts';

const {
  fetchProjectRailsWorker,
  startProjectRailsWorker,
  stopProjectRailsWorker,
  restartProjectRailsWorker,
  fetchProjectRailsWorkerLog,
  clearProjectRailsWorkerLog,
} = vi.hoisted(() => ({
  fetchProjectRailsWorker: vi.fn(),
  startProjectRailsWorker: vi.fn(),
  stopProjectRailsWorker: vi.fn(),
  restartProjectRailsWorker: vi.fn(),
  fetchProjectRailsWorkerLog: vi.fn(),
  clearProjectRailsWorkerLog: vi.fn(),
}));

vi.mock('../src/api', () => ({
  fetchProjectRailsWorker,
  startProjectRailsWorker,
  stopProjectRailsWorker,
  restartProjectRailsWorker,
  fetchProjectRailsWorkerLog,
  clearProjectRailsWorkerLog,
}));

import ProjectRailsRuntimePanel from '../src/components/ProjectRailsRuntimePanel.vue';

const project: Project = {
  id: 'p1',
  workspaceId: 'w1',
  name: 'API Rails',
  path: '/projetos/api-rails',
  type: 'rails',
  source: 'workspace',
  favorite: false,
  enabled: true,
  capabilities: ['server', 'sidekiq'],
};

const projectWithBothWorkers: Project = {
  ...project,
  capabilities: ['server', 'sidekiq', 'webpack'],
};

function overview(
  workerId: RailsWorkerId,
  detected = workerId === 'sidekiq',
): RailsWorkerOverview {
  return { id: workerId, detected, process: null };
}

describe('ProjectRailsRuntimePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    fetchProjectRailsWorker.mockImplementation(
      async (_projectId: string, workerId: RailsWorkerId) => overview(workerId),
    );
    fetchProjectRailsWorkerLog.mockImplementation(
      async (_projectId: string, workerId: RailsWorkerId) => ({
        projectId: 'p1',
        processId: `p1:${workerId}`,
        content: `${workerId} log de exemplo`,
        sizeBytes: 20,
        truncated: false,
        masked: false,
        redactionCount: 0,
        readAt: '2026-08-05T12:00:00.000Z',
      }),
    );
  });

  it('exibe apenas os workers suportados e remove credentials da interface', async () => {
    const wrapper = mount(ProjectRailsRuntimePanel, {
      props: { project },
    });

    await flushPromises();

    const tabs = wrapper.findAll('[role="tab"]');
    expect(tabs).toHaveLength(1);
    expect(tabs[0]?.text()).toContain('Sidekiq');
    expect(tabs[0]?.attributes('aria-selected')).toBe('true');

    const sidekiqPanel = wrapper.find('[data-worker-id="sidekiq"]');
    expect(sidekiqPanel.isVisible()).toBe(true);
    expect(sidekiqPanel.find('button.primary-button').exists()).toBe(true);
    expect(wrapper.find('[data-worker-id="webpack"]').exists()).toBe(false);
    expect(fetchProjectRailsWorker).toHaveBeenCalledWith('p1', 'sidekiq');
    expect(fetchProjectRailsWorker).not.toHaveBeenCalledWith('p1', 'webpack');
    expect(wrapper.find('.rails-credentials-card').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Credentials');

    wrapper.unmount();
  });

  it('inicia o Sidekiq pela aba dedicada', async () => {
    startProjectRailsWorker.mockResolvedValueOnce({
      id: 'p1:worker:sidekiq',
      projectId: 'p1',
      kind: 'worker',
      status: 'running',
      pid: 4242,
      command: '/projetos/api-rails/bin/sidekiq',
      startedAt: '2026-08-05T12:00:00.000Z',
    });

    const wrapper = mount(ProjectRailsRuntimePanel, {
      props: { project },
    });

    await flushPromises();

    const sidekiqPanel = wrapper.find('[data-worker-id="sidekiq"]');
    await sidekiqPanel.find('button.primary-button').trigger('click');
    await flushPromises();

    expect(startProjectRailsWorker).toHaveBeenCalledWith('p1', 'sidekiq');
    expect(sidekiqPanel.text()).toContain('4242');
    expect(sidekiqPanel.text()).toContain('Processo ativo e respondendo');

    wrapper.unmount();
  });

  it('mantém um painel de logs independente para cada processo', async () => {
    fetchProjectRailsWorker.mockImplementation(
      async (_projectId: string, workerId: RailsWorkerId) =>
        overview(workerId, true),
    );

    const wrapper = mount(ProjectRailsRuntimePanel, {
      props: { project: projectWithBothWorkers },
    });

    await flushPromises();

    const sidekiqPanel = wrapper.find('[data-worker-id="sidekiq"]');
    await sidekiqPanel.find('.rails-worker-log-toggle').trigger('click');
    await flushPromises();

    expect(fetchProjectRailsWorkerLog).toHaveBeenCalledWith('p1', 'sidekiq');
    expect(sidekiqPanel.find('.rails-worker-log-content').text()).toContain(
      'sidekiq log de exemplo',
    );

    await wrapper.findAll('[role="tab"]')[1]?.trigger('click');
    const webpackPanel = wrapper.find('[data-worker-id="webpack"]');
    await webpackPanel.find('.rails-worker-log-toggle').trigger('click');
    await flushPromises();

    expect(fetchProjectRailsWorkerLog).toHaveBeenCalledWith('p1', 'webpack');
    expect(webpackPanel.find('.rails-worker-log-content').text()).toContain(
      'webpack log de exemplo',
    );
    expect(sidekiqPanel.find('.rails-worker-log-content').text()).toContain(
      'sidekiq log de exemplo',
    );

    wrapper.unmount();
  });
});
