import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

import type { Project, RailsWorkerOverview } from '@dev-dashboard/contracts';

const {
  fetchProjectRailsWorker,
  fetchProjectRailsCredentials,
  startProjectRailsWorker,
  stopProjectRailsWorker,
  restartProjectRailsWorker,
  fetchProjectRailsWorkerLog,
  clearProjectRailsWorkerLog,
} = vi.hoisted(() => ({
  fetchProjectRailsWorker: vi.fn(
    async (_projectId: string, workerId: 'sidekiq' | 'webpack'): Promise<RailsWorkerOverview> => {
      if (workerId === 'sidekiq') {
        return { id: 'sidekiq', detected: true, process: null };
      }
      return { id: 'webpack', detected: false, process: null };
    },
  ),
  fetchProjectRailsCredentials: vi.fn().mockResolvedValue({
    supported: true,
    environments: [
      {
        name: 'default',
        credentialsPath: 'config/credentials.yml.enc',
        credentialsFileExists: true,
        keyPath: 'config/master.key',
        keyFileExists: true,
        keySource: 'file',
      },
    ],
  }),
  startProjectRailsWorker: vi.fn(),
  stopProjectRailsWorker: vi.fn(),
  restartProjectRailsWorker: vi.fn(),
  fetchProjectRailsWorkerLog: vi.fn(),
  clearProjectRailsWorkerLog: vi.fn(),
}));

vi.mock('../src/api', () => ({
  fetchProjectRailsWorker,
  fetchProjectRailsCredentials,
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
  capabilities: ['server'],
};

describe('ProjectRailsRuntimePanel', () => {
  it('mostra apenas o Sidekiq detectado; o card do webpack fica oculto', async () => {
    const wrapper = mount(ProjectRailsRuntimePanel, {
      props: { project },
    });

    await flushPromises();

    const cards = wrapper.findAll('.rails-worker-card');
    expect(cards).toHaveLength(2);

    const sidekiqCard = cards[0];
    expect(sidekiqCard?.text()).toContain('Sidekiq');
    expect(sidekiqCard?.isVisible()).toBe(true);
    expect(sidekiqCard?.find('button.primary-button').exists()).toBe(true);

    const webpackCard = cards[1];
    expect(webpackCard?.text()).toContain('webpack-dev-server');
    expect(webpackCard?.isVisible()).toBe(false);
  });

  it('inicia o Sidekiq ao clicar em Iniciar', async () => {
    startProjectRailsWorker.mockResolvedValueOnce({
      id: 'p1:worker:sidekiq',
      projectId: 'p1',
      kind: 'worker',
      status: 'running',
      pid: 4242,
      command: '/projetos/api-rails/bin/sidekiq',
    });

    const wrapper = mount(ProjectRailsRuntimePanel, {
      props: { project },
    });

    await flushPromises();

    const startButton = wrapper.findAll('.rails-worker-card')[0]?.find('button.primary-button');
    await startButton?.trigger('click');
    await flushPromises();

    expect(startProjectRailsWorker).toHaveBeenCalledWith('p1', 'sidekiq');
    expect(wrapper.text()).toContain('4242');
  });

  it('mostra o status somente leitura das credentials sem expor conteúdo', async () => {
    const wrapper = mount(ProjectRailsRuntimePanel, {
      props: { project },
    });

    await flushPromises();

    const credentialsCard = wrapper.find('.rails-credentials-card');
    expect(credentialsCard.text()).toContain('default');
    expect(credentialsCard.text()).toContain('Presente');
    expect(credentialsCard.text()).not.toContain('config/master.key');
    expect(credentialsCard.html()).not.toMatch(/[0-9a-f]{32,}/);
  });
});
