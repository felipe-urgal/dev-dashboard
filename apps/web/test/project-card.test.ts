import { mount } from '@vue/test-utils';
import { NDropdown } from 'naive-ui';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Project } from '@dev-dashboard/contracts';

const api = vi.hoisted(() => ({
  startProjectProcess: vi.fn(),
  stopProjectProcess: vi.fn(),
  loadProcessSummary: vi.fn(),
  running: { value: true },
  lastPort: { value: undefined as number | undefined },
}));

vi.mock('../src/stores/dashboard', async () => {
  const { ref } = await import('vue');
  return {
    dashboardStore: {
      processReadComplete: ref(true),
      loadProcessSummary: api.loadProcessSummary,
      getCardProcess: (projectId: string) => {
        if (projectId !== 'p1') return null;
        if (api.running.value) {
          return {
            id: 'process-p1',
            projectId,
            kind: 'server',
            status: 'running',
            port: 3003,
          };
        }
        return api.lastPort.value
          ? {
              id: 'process-p1',
              projectId,
              kind: 'server',
              status: 'stopped',
              port: api.lastPort.value,
            }
          : null;
      },
    },
  };
});

vi.mock('../src/api', () => ({
  fetchProjectGit: vi.fn().mockResolvedValue({
    repository: true,
    branch: 'feature/listar-branch',
    detached: false,
    ahead: 0,
    behind: 0,
    clean: false,
    files: [],
    recentCommits: [],
  }),
  startProjectProcess: api.startProjectProcess,
  stopProjectProcess: api.stopProjectProcess,
}));

import ProjectCard from '../src/components/ProjectCard.vue';

const project: Project = {
  id: 'p1',
  workspaceId: 'w1',
  name: 'Projeto sem avatar',
  path: '/projetos/sem-avatar',
  type: 'node',
  source: 'workspace',
  enabled: true,
  capabilities: ['git', 'server'],
};

function mountCard(overrides: Partial<Project> = {}) {
  return mount(ProjectCard, {
    props: { project: { ...project, ...overrides } },
    global: {
      stubs: {
        RouterLink: {
          template: '<a><slot /></a>',
        },
      },
    },
  });
}

beforeEach(() => {
  api.running.value = true;
  api.lastPort.value = undefined;
  api.startProjectProcess.mockReset().mockResolvedValue({});
  api.stopProjectProcess.mockReset().mockResolvedValue({});
  api.loadProcessSummary.mockReset().mockResolvedValue(undefined);
});

describe('ProjectCard', () => {
  it('renderiza nome, branch, alterações e porta na linha', async () => {
    const wrapper = mountCard();

    expect(wrapper.get('.project-row-name').text()).toContain(
      'Projeto sem avatar',
    );
    expect(wrapper.get('.project-row-avatar').attributes('data-type')).toBe(
      'node',
    );

    await vi.waitFor(() => {
      expect(wrapper.get('.project-row-branch').text()).toBe(
        'feature/listar-branch',
      );
      expect(wrapper.get('.project-row-dirty').text()).toContain('alterado');
    });
    expect(wrapper.get('.project-row-port').text()).toBe(':3003');
    expect(wrapper.get('.project-row-state').text()).toContain('Executando');
  });

  it('mostra a última porta antes de iniciar e o progresso ao iniciar', async () => {
    api.running.value = false;
    api.lastPort.value = 3003;
    let release: () => void = () => undefined;
    api.startProjectProcess.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    );
    const wrapper = mountCard();

    expect(wrapper.get('.project-row-port-idle').text()).toBe(':3003');
    await wrapper.get('.project-row-button').trigger('click');

    expect(wrapper.get('.project-row-button').text()).toContain('Iniciando…');
    expect(wrapper.get('.project-row-button').attributes('disabled')).toBe('');
    release();
  });

  it('para o servidor em execução pelo botão da linha', async () => {
    const wrapper = mountCard();
    const button = wrapper.get('.project-row-button');

    expect(button.text()).toBe('Parar');
    await button.trigger('click');

    await vi.waitFor(() =>
      expect(api.loadProcessSummary).toHaveBeenCalledTimes(1),
    );
    expect(api.stopProjectProcess).toHaveBeenCalledWith('p1');
    expect(api.startProjectProcess).not.toHaveBeenCalled();
  });

  it('para o servidor antes de desativar um projeto em execução', async () => {
    const wrapper = mountCard();

    wrapper.getComponent(NDropdown).vm.$emit('select', 'toggle');

    await vi.waitFor(() =>
      expect(wrapper.emitted('toggle-enabled')).toEqual([[project]]),
    );
    expect(api.stopProjectProcess).toHaveBeenCalledWith('p1');
    expect(api.loadProcessSummary).toHaveBeenCalledTimes(1);
  });

  it('não desativa o projeto quando o servidor não para', async () => {
    api.stopProjectProcess.mockRejectedValueOnce(new Error('sem permissão'));
    const wrapper = mountCard();

    wrapper.getComponent(NDropdown).vm.$emit('select', 'toggle');

    await vi.waitFor(() =>
      expect(wrapper.get('.project-row-error').text()).toBe('sem permissão'),
    );
    expect(wrapper.emitted('toggle-enabled')).toBeUndefined();
  });
});
