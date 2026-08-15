import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

import type { Project } from '@dev-dashboard/contracts';

vi.mock('../src/api', () => ({
  fetchProjectProcess: vi.fn().mockResolvedValue({
    id: 'process-p1',
    projectId: 'p1',
    kind: 'server',
    status: 'running',
    port: 3003,
  }),
  fetchProjectGit: vi.fn().mockResolvedValue({
    repository: true,
    branch: 'feature/listar-branch',
    detached: false,
    ahead: 0,
    behind: 0,
    clean: true,
    files: [],
    recentCommits: [],
  }),
  startProjectProcess: vi.fn(),
  stopProjectProcess: vi.fn(),
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

describe('ProjectCard', () => {
  it('renderiza identidade, branch e porta como um card', async () => {
    const wrapper = mountCard();

    expect(wrapper.get('.project-card-identity').text()).toContain(
      'Projeto sem avatar',
    );
    expect(wrapper.get('.project-card-avatar').attributes('data-type')).toBe(
      'node',
    );

    await vi.waitFor(() => {
      expect(wrapper.get('.project-card-branch').text()).toContain(
        'feature/listar-branch',
      );
      expect(wrapper.get('.project-card-port').text()).toBe(':3003');
    });
  });

  it('expõe uma única ação acessível para desativar e reativar', async () => {
    const wrapper = mountCard();
    const button = wrapper.get('.project-card-toggle');

    expect(button.attributes('aria-label')).toBe(
      'Desativar Projeto sem avatar',
    );
    expect(button.attributes('title')).toBe('Desativar Projeto sem avatar');
    expect(button.attributes('aria-pressed')).toBe('false');

    await button.trigger('click');

    expect(wrapper.emitted('toggle-enabled')).toEqual([[project]]);

    await wrapper.setProps({
      project: {
        ...project,
        enabled: false,
      },
    });
    expect(button.attributes('aria-label')).toBe('Ativar Projeto sem avatar');
    expect(button.attributes('title')).toBe('Ativar Projeto sem avatar');
    expect(button.attributes('aria-pressed')).toBe('true');
  });

  it('marca o card como desativado e esconde o menu de processos', () => {
    const wrapper = mountCard({ enabled: false });

    expect(wrapper.get('.project-card').attributes('data-state')).toBe(
      'disabled',
    );
    expect(wrapper.get('.project-card').classes()).toContain(
      'project-card-disabled',
    );
    expect(wrapper.find('.processes-menu').exists()).toBe(false);
  });
});
