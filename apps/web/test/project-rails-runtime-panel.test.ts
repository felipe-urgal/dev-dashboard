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
  followProjectRailsWorkerLogEvents,
  clearProjectRailsWorkerLog,
} = vi.hoisted(() => ({
  fetchProjectRailsWorker: vi.fn(),
  startProjectRailsWorker: vi.fn(),
  stopProjectRailsWorker: vi.fn(),
  restartProjectRailsWorker: vi.fn(),
  fetchProjectRailsWorkerLog: vi.fn(),
  followProjectRailsWorkerLogEvents: vi.fn(
    (
      _projectId: string,
      workerId: RailsWorkerId,
      onEvent: (log: unknown) => void,
    ) => {
      onEvent({
        projectId: 'p1',
        processId: `p1:${workerId}`,
        content: `${workerId} log de exemplo`,
        sizeBytes: 20,
        truncated: false,
        masked: false,
        redactionCount: 0,
        readAt: '2026-08-05T12:00:00.000Z',
      });
      return { close: vi.fn(), done: new Promise<void>(() => undefined) };
    },
  ),
  clearProjectRailsWorkerLog: vi.fn(),
}));

vi.mock('../src/api', () => ({
  fetchProjectRailsWorker,
  startProjectRailsWorker,
  stopProjectRailsWorker,
  restartProjectRailsWorker,
  fetchProjectRailsWorkerLog,
  followProjectRailsWorkerLogEvents,
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
  enabled: true,
  capabilities: ['server'],
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

  it('renderiza o worker informado por prop e remove credentials da interface', async () => {
    const sidekiqWrapper = mount(ProjectRailsRuntimePanel, {
      props: { project, workerId: 'sidekiq' },
    });
    await flushPromises();

    const sidekiqPanel = sidekiqWrapper.find('[data-worker-id="sidekiq"]');
    expect(sidekiqPanel.exists()).toBe(true);
    expect(sidekiqPanel.find('button.primary-button').exists()).toBe(true);
    expect(fetchProjectRailsWorker).toHaveBeenCalledWith('p1', 'sidekiq');
    sidekiqWrapper.unmount();

    const webpackWrapper = mount(ProjectRailsRuntimePanel, {
      props: { project, workerId: 'webpack' },
    });
    await flushPromises();

    expect(webpackWrapper.text()).toContain(
      'webpack-dev-server não foi detectado',
    );
    expect(webpackWrapper.find('.rails-credentials-card').exists()).toBe(false);
    expect(webpackWrapper.text()).not.toContain('Credentials');

    webpackWrapper.unmount();
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
      props: { project, workerId: 'sidekiq' },
    });

    await flushPromises();

    await wrapper.find('button.primary-button').trigger('click');
    await flushPromises();

    expect(startProjectRailsWorker).toHaveBeenCalledWith('p1', 'sidekiq');
    expect(wrapper.text()).toContain('4242');
    expect(wrapper.text()).toContain('Processo ativo e respondendo');

    wrapper.unmount();
  });

  it('mantém um painel de logs independente para cada processo', async () => {
    fetchProjectRailsWorker.mockImplementation(
      async (_projectId: string, workerId: RailsWorkerId) =>
        overview(workerId, true),
    );

    const sidekiqWrapper = mount(ProjectRailsRuntimePanel, {
      props: { project, workerId: 'sidekiq' },
    });
    await flushPromises();

    await sidekiqWrapper.find('.rails-worker-log-toggle').trigger('click');
    await flushPromises();

    expect(followProjectRailsWorkerLogEvents).toHaveBeenCalledWith(
      'p1',
      'sidekiq',
      expect.any(Function),
    );
    expect(sidekiqWrapper.find('.rails-worker-log-content').text()).toContain(
      'sidekiq log de exemplo',
    );

    const webpackWrapper = mount(ProjectRailsRuntimePanel, {
      props: { project, workerId: 'webpack' },
    });
    await flushPromises();

    await webpackWrapper.find('.rails-worker-log-toggle').trigger('click');
    await flushPromises();

    expect(followProjectRailsWorkerLogEvents).toHaveBeenCalledWith(
      'p1',
      'webpack',
      expect.any(Function),
    );
    expect(webpackWrapper.find('.rails-worker-log-content').text()).toContain(
      'webpack log de exemplo',
    );
    expect(sidekiqWrapper.find('.rails-worker-log-content').text()).toContain(
      'sidekiq log de exemplo',
    );

    sidekiqWrapper.unmount();
    webpackWrapper.unmount();
  });
});
