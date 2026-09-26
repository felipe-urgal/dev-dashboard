import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Project } from '@dev-dashboard/contracts';

const { route } = vi.hoisted(() => ({
  route: {
    name: 'project-server',
    query: {} as Record<string, string>,
  },
}));

vi.mock('vue-router', () => ({
  useRoute: () => route,
  RouterLink: {
    name: 'RouterLink',
    props: ['to'],
    template: '<a class="router-link-stub"><slot /></a>',
  },
}));

import ProjectSidebarNavigation from '../src/components/ProjectSidebarNavigation.vue';

const project: Project = {
  id: 'p1',
  workspaceId: 'w1',
  name: 'home-music',
  path: '/projects/home-music',
  type: 'rails',
  source: 'workspace',
  enabled: true,
  capabilities: ['server', 'git', 'production'],
};

function mountNavigation(sidebarCollapsed = false) {
  return mount(ProjectSidebarNavigation, {
    props: {
      project,
      sidebarCollapsed,
      sidekiqDetected: true,
      webpackDetected: true,
    },
  });
}

describe('ProjectSidebarNavigation', () => {
  beforeEach(() => {
    route.name = 'project-server';
    route.query = {};
  });

  it('usa grupos de menu para organizar as ferramentas do projeto', () => {
    const wrapper = mountNavigation();

    const labels = wrapper
      .findAll('.project-details-menu-trigger')
      .map((button) => button.text());

    expect(labels).toEqual(['Servidor', 'Git', 'Desenvolvimento', 'Qualidade']);
  });

  it('abre Git sem navegar e só então exibe as opções do grupo', async () => {
    const wrapper = mountNavigation();
    const gitTrigger = wrapper
      .findAll('.project-details-menu-trigger')
      .find((button) => button.text().includes('Git'));

    expect(gitTrigger).toBeDefined();
    expect(gitTrigger?.element.tagName).toBe('BUTTON');
    expect(gitTrigger?.attributes('aria-expanded')).toBe('false');
    expect(
      wrapper.find('#project-sidebar-git-menu').attributes('style'),
    ).toContain('display: none');

    await gitTrigger?.trigger('click');

    expect(gitTrigger?.attributes('aria-expanded')).toBe('true');
    expect(
      wrapper.find('#project-sidebar-git-menu').attributes('style') ?? '',
    ).not.toContain('display: none');
    expect(wrapper.find('#project-sidebar-git-menu').text()).toContain(
      'Sincronização',
    );
    expect(wrapper.find('#project-sidebar-git-menu').text()).toContain(
      'Branches',
    );
    expect(wrapper.find('#project-sidebar-git-menu').text()).toContain(
      'Worktrees',
    );
  });

  it('mantém aberto o grupo correspondente à rota ativa', () => {
    route.name = 'project-readiness';

    const wrapper = mountNavigation();
    const qualityTrigger = wrapper
      .findAll('.project-details-menu-trigger')
      .find((button) => button.text().includes('Qualidade'));

    expect(qualityTrigger?.attributes('aria-expanded')).toBe('true');
    expect(
      wrapper.find('#project-sidebar-quality-menu').attributes('style') ?? '',
    ).not.toContain('display: none');
  });

  it('expande a sidebar recolhida antes de abrir um grupo', async () => {
    const wrapper = mountNavigation(true);
    const gitTrigger = wrapper
      .findAll('.project-details-menu-trigger')
      .find((button) => button.text().includes('Git'));

    await gitTrigger?.trigger('click');

    expect(wrapper.emitted('expand-sidebar')).toHaveLength(1);
  });
});
