import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Project, Workspace } from '@dev-dashboard/contracts';

const actions = vi.hoisted(() => ({
  escanear: vi.fn(),
  remover: vi.fn(),
}));

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
      scanningWorkspace: ref(false),
      deletingWorkspace: ref(false),
      errorMessage: ref(''),
      successMessage: ref(''),
      warningCount: ref(0),
      lastScannedPath: ref(''),
      selectedWorkspace: computed(() => workspaces.value.find((item) => item.id === selectedWorkspaceId.value)),
      sortedProjects: computed(() => [...projects.value].sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name))),
      scanSelectedWorkspace: actions.escanear,
      handleDeleteWorkspace: actions.remover,
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
  vi.clearAllMocks();
  dashboardStore.projects.value = [];
  dashboardStore.workspaces.value = [];
  dashboardStore.selectedWorkspaceId.value = '';
  dashboardStore.loadingProjects.value = false;
  dashboardStore.lastScannedPath.value = '';
});

describe('dashboard principal', () => {
  it('não renderiza hero nem formulário de workspace, só repositórios em Card', () => {
    const wrapper = mountView();
    expect(wrapper.find('.hero-copy').exists()).toBe(false);
    expect(wrapper.find('.workspace-panel').exists()).toBe(false);
    expect(wrapper.find('.workspace-create-form').exists()).toBe(false);
    expect(wrapper.find('.metrics-grid').exists()).toBe(false);
    expect(wrapper.find('.repositories-section').classes()).toContain('dd-card');
  });

  it('lista projetos em .projects-list em vez de grid de cards', () => {
    dashboardStore.projects.value = [project];
    const wrapper = mountView();
    expect(wrapper.find('.projects-list').exists()).toBe(true);
    expect(wrapper.find('.projects-grid').exists()).toBe(false);
  });

  it('aciona escanear/remover a partir da linha de workspace carregado', async () => {
    dashboardStore.lastScannedPath.value = '/home/ubunru/Caiena/Projetos';
    const wrapper = mountView();

    await wrapper.get('.secondary-button').trigger('click');
    await wrapper.get('.danger-button').trigger('click');

    expect(actions.escanear).toHaveBeenCalledOnce();
    expect(actions.remover).toHaveBeenCalledOnce();
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
