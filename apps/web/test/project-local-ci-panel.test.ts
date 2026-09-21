import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Project } from '@dev-dashboard/contracts';

const fetchLocalCiCatalog = vi.hoisted(() => vi.fn());
const fetchLocalCiRun = vi.hoisted(() => vi.fn());
const startLocalCiRun = vi.hoisted(() => vi.fn());
const cancelLocalCiRun = vi.hoisted(() => vi.fn());
const localCiWebSocketUrl = vi.hoisted(() => vi.fn(() => 'ws://local/run'));

vi.mock('../src/api/local-ci', () => ({
  fetchLocalCiCatalog: (...args: unknown[]) => fetchLocalCiCatalog(...args),
  fetchLocalCiRun: (...args: unknown[]) => fetchLocalCiRun(...args),
  startLocalCiRun: (...args: unknown[]) => startLocalCiRun(...args),
  cancelLocalCiRun: (...args: unknown[]) => cancelLocalCiRun(...args),
  localCiWebSocketUrl: (...args: unknown[]) => localCiWebSocketUrl(...args),
}));

import ProjectLocalCiPanel from '../src/components/ProjectLocalCiPanel.vue';

const project: Project = {
  id: 'project-local-ci',
  workspaceId: 'workspace-local-ci',
  name: 'Projeto Local CI',
  path: '/tmp/project-local-ci',
  type: 'node',
  source: 'workspace',
  enabled: true,
  capabilities: ['git'],
};

function catalog(state: 'available' | 'act-missing' | 'docker-unavailable') {
  return {
    provider: 'act' as const,
    approximation: true as const,
    availability: {
      state,
      ...(state !== 'act-missing' ? { actVersion: '0.2.81' } : {}),
      ...(state === 'available' ? { dockerVersion: '28.0.0' } : {}),
    },
    jobs: [
      {
        workflowFile: '.github/workflows/ci.yml',
        workflow: 'CI',
        jobId: 'test',
        job: 'Test',
        events: ['push', 'pull_request'],
      },
    ],
  };
}

describe('ProjectLocalCiPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
  });

  it('mantém a aproximação visível e bloqueia execução sem provider', async () => {
    fetchLocalCiCatalog.mockResolvedValueOnce(catalog('act-missing'));

    const wrapper = mount(ProjectLocalCiPanel, { props: { project } });
    await flushPromises();

    expect(wrapper.text()).toContain('Local / aproximação');
    expect(wrapper.text()).toContain('Não substitui o GitHub CI');
    expect(wrapper.text()).toContain('act não instalado');
    expect(wrapper.get('.local-ci-start').attributes('disabled')).toBeDefined();
    expect(startLocalCiRun).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it('inicia somente a combinação selecionada do catálogo', async () => {
    fetchLocalCiCatalog.mockResolvedValueOnce(catalog('available'));
    startLocalCiRun.mockResolvedValueOnce({
      id: 'run-1',
      projectId: project.id,
      provider: 'act',
      approximation: true,
      request: {
        workflowFile: '.github/workflows/ci.yml',
        jobId: 'test',
        event: 'pull_request',
      },
      status: 'exited',
      logs: 'ok',
      truncated: false,
      exitCode: 0,
      exitSignal: null,
      timedOut: false,
      startedAt: '2026-09-21T12:00:00.000Z',
      endedAt: '2026-09-21T12:01:00.000Z',
    });

    const wrapper = mount(ProjectLocalCiPanel, { props: { project } });
    await flushPromises();

    await wrapper.getAll('select')[1]!.setValue('pull_request');
    await wrapper.get('.local-ci-start').trigger('click');
    await flushPromises();

    expect(startLocalCiRun).toHaveBeenCalledWith(project.id, {
      workflowFile: '.github/workflows/ci.yml',
      jobId: 'test',
      event: 'pull_request',
    });
    expect(wrapper.text()).toContain('Concluído');
    expect(wrapper.text()).toContain('Exit code 0');
    expect(window.sessionStorage.getItem(
      'dev-dashboard-local-ci:' + project.id + ':run',
    )).toBe('run-1');

    wrapper.unmount();
  });

  it('restaura o último run da sessão sem criar uma nova execução', async () => {
    window.sessionStorage.setItem(
      'dev-dashboard-local-ci:' + project.id + ':run',
      'run-previous',
    );
    fetchLocalCiCatalog.mockResolvedValueOnce(catalog('available'));
    fetchLocalCiRun.mockResolvedValueOnce({
      id: 'run-previous',
      projectId: project.id,
      provider: 'act',
      approximation: true,
      request: {
        workflowFile: '.github/workflows/ci.yml',
        jobId: 'test',
        event: 'push',
      },
      status: 'exited',
      logs: 'restored output',
      truncated: false,
      exitCode: 0,
      exitSignal: null,
      timedOut: false,
      startedAt: '2026-09-21T11:00:00.000Z',
      endedAt: '2026-09-21T11:01:00.000Z',
    });

    const wrapper = mount(ProjectLocalCiPanel, { props: { project } });
    await flushPromises();

    expect(fetchLocalCiRun).toHaveBeenCalledWith(project.id, 'run-previous');
    expect(startLocalCiRun).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('restored output');

    wrapper.unmount();
  });
});
