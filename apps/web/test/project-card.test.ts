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

describe('ProjectCard', () => {
  it('renderiza metadados e mantém só desativar no canto direito', async () => {
    const wrapper = mount(ProjectCard, {
      props: { project },
      global: {
        stubs: {
          RouterLink: {
            template: '<a><slot /></a>',
          },
        },
      },
    });

    expect(wrapper.find('.project-avatar').exists()).toBe(false);
    expect(wrapper.get('.project-row-identity').text()).toContain(
      'Projeto sem avatar',
    );
    expect(wrapper.find('.project-recent-badge').exists()).toBe(false);
    expect(wrapper.find('.type-badge').exists()).toBe(false);
    expect(wrapper.find('.project-row-action').exists()).toBe(false);
    expect(wrapper.find('.project-favorite-button').exists()).toBe(false);
    expect(wrapper.find('.project-remove-button').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Abrir');
    expect(wrapper.get('.project-row-status').attributes('aria-label')).toBe(
      'Parado',
    );
    expect(wrapper.get('.project-row-actions').findAll('button')).toHaveLength(
      1,
    );

    await vi.waitFor(() => {
      expect(wrapper.get('.project-branch-badge').text()).toContain(
        'feature/listar-branch',
      );
      expect(wrapper.get('.project-port-badge').text()).toBe('Porta 3003');
    });
    expect(wrapper.text()).not.toContain('Git');
  });

  it('expõe uma ação acessível para desativar e reativar', async () => {
    const wrapper = mount(ProjectCard, {
      props: { project },
      global: {
        stubs: {
          RouterLink: {
            template: '<a><slot /></a>',
          },
        },
      },
    });
    const button = wrapper.get('.project-disable-button');

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
});
