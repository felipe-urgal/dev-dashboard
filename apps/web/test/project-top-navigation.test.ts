import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Project } from '@dev-dashboard/contracts';

const { route, push } = vi.hoisted(() => ({
  route: { name: 'project-server', query: {} as Record<string, string> },
  push: vi.fn(),
}));

vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ push }),
  RouterLink: {
    name: 'RouterLink',
    props: ['to'],
    template: '<a class="router-link-stub"><slot /></a>',
  },
}));

import ProjectTopNavigation from '../src/components/ProjectTopNavigation.vue';

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

function mountNavigation() {
  return mount(ProjectTopNavigation, {
    props: { project, sidekiqDetected: true, webpackDetected: true },
  });
}

describe('ProjectTopNavigation', () => {
  beforeEach(() => {
    route.name = 'project-server';
    route.query = {};
  });

  it('agrupa as ferramentas em áreas e destaca a área da rota atual', () => {
    const wrapper = mountNavigation();
    const hubs = wrapper.findAll('.project-nav-hub');

    expect(
      hubs.map((hub) =>
        hub.find('.project-nav-top').exists()
          ? hub.get('.project-nav-top').text()
          : hub.text(),
      ),
    ).toEqual(['Execução', 'Git', 'Agente', 'Produção']);
    expect(wrapper.findAll('.project-nav-hub-active')).toHaveLength(1);
    expect(wrapper.get('.project-nav-hub-active .project-nav-sub').text()).toBe(
      'Servidor',
    );
  });

  it('marca a aba do Git ativa a partir da query da rota', () => {
    route.name = 'project-git';
    route.query = { tab: 'branches' };

    const wrapper = mountNavigation();

    expect(wrapper.get('.project-nav-hub-active .project-nav-top').text()).toBe(
      'Git',
    );
    expect(wrapper.get('.project-nav-hub-active .project-nav-sub').text()).toBe(
      'Branches',
    );
  });
});
