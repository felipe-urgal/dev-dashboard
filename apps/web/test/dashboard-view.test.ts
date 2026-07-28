import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Project, Workspace } from '@dev-dashboard/contracts';

vi.mock('../src/stores/dashboard', async () => {
  const { computed, ref } = await import('vue');
  const projects = ref<Project[]>([]);
  const workspaces = ref<Workspace[]>([]);
  const selectedWorkspaceId = ref('');

  return {
    dashboardStore: {
      projects,
      workspaces,
      selectedWorkspaceId,
      loadingProjects: ref(false),
      errorMessage: ref(''),
      successMessage: ref(''),
      warningCount: ref(0),
      lastScannedPath: ref(''),
      selectedWorkspace: computed(() => workspaces.value.find((item) => item.id === selectedWorkspaceId.value)),
      railsProjects: computed(() => projects.value.filter((item) => item.type === 'rails').length),
      nodeProjects: computed(() => projects.value.filter((item) => item.type === 'node').length),
      gitProjects: computed(() => projects.value.filter((item) => item.capabilities.includes('git')).length),
      sortedProjects: computed(() => [...projects.value].sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name))),
    },
  };
});

import { dashboardStore } from '../src/stores/dashboard';
import DashboardView from '../src/views/DashboardView.vue';

const project: Project = {
  id: 'p1', workspaceId: 'w1', name: 'Favorito', path: '/projetos/favorito', type: 'node',
  source: 'workspace', favorite: true, capabilities: ['git'],
};

function mountView() {
  return mount(DashboardView, {
    global: {
      stubs: {
        ProjectCard: { props: ['project'], template: '<li class="project-stub">{{ project.name }}</li>' },
      },
    },
  });
}

beforeEach(() => {
  dashboardStore.projects.value = [];
  dashboardStore.workspaces.value = [];
  dashboardStore.selectedWorkspaceId.value = '';
  dashboardStore.loadingProjects.value = false;
});

describe('dashboard principal', () => {
  it('compõe métricas e repositórios com Card, sem hero nem formulário de workspace', () => {
    const wrapper = mountView();
    expect(wrapper.find('.hero-copy').exists()).toBe(false);
    expect(wrapper.find('.workspace-panel').exists()).toBe(false);
    expect(wrapper.find('.workspace-create-form').exists()).toBe(false);
    expect(wrapper.findAll('.metric-card')).toHaveLength(4);
    expect(wrapper.find('.repositories-section').classes()).toContain('dd-card');
  });

  it('lista projetos em .projects-list em vez de grid de cards', () => {
    dashboardStore.projects.value = [project];
    const wrapper = mountView();
    expect(wrapper.find('.projects-list').exists()).toBe(true);
    expect(wrapper.find('.projects-grid').exists()).toBe(false);
  });

  it('mantém os estados de carregamento, vazio e projetos favoritos', async () => {
    dashboardStore.loadingProjects.value = true;
    const wrapper = mountView();
    expect(wrapper.text()).toContain('Carregando projetos');

    dashboardStore.loadingProjects.value = false;
    await nextTick();
    expect(wrapper.text()).toContain('Nenhum projeto carregado');

    dashboardStore.projects.value = [project];
    await nextTick();
    expect(wrapper.get('.project-stub').text()).toBe('Favorito');
  });
});
