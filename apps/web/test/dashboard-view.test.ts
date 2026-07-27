import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Project, Workspace } from '@dev-dashboard/contracts';

const actions = vi.hoisted(() => ({
  criar: vi.fn(),
  escanear: vi.fn(),
  remover: vi.fn(),
  selecionar: vi.fn(),
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
      newWorkspaceName: ref(''),
      newWorkspacePath: ref(''),
      loadingProjects: ref(false),
      scanningWorkspace: ref(false),
      creatingWorkspace: ref(false),
      deletingWorkspace: ref(false),
      errorMessage: ref(''),
      successMessage: ref(''),
      warningCount: ref(0),
      lastScannedPath: ref(''),
      selectedWorkspace: computed(() => workspaces.value.find((item) => item.id === selectedWorkspaceId.value)),
      railsProjects: computed(() => projects.value.filter((item) => item.type === 'rails').length),
      nodeProjects: computed(() => projects.value.filter((item) => item.type === 'node').length),
      gitProjects: computed(() => projects.value.filter((item) => item.capabilities.includes('git')).length),
      sortedProjects: computed(() => [...projects.value].sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name))),
      scanSelectedWorkspace: actions.escanear,
      handleWorkspaceSelection: actions.selecionar,
      handleCreateWorkspace: actions.criar,
      handleDeleteWorkspace: actions.remover,
    },
  };
});

import { dashboardStore } from '../src/stores/dashboard';
import DashboardView from '../src/views/DashboardView.vue';

const workspace: Workspace = { id: 'w1', name: 'Principal', path: '/projetos', enabled: true };
const project: Project = {
  id: 'p1', workspaceId: 'w1', name: 'Favorito', path: '/projetos/favorito', type: 'node',
  source: 'workspace', favorite: true, capabilities: ['git'],
};

function mountView() {
  return mount(DashboardView, {
    global: {
      stubs: {
        ProjectCard: { props: ['project'], template: '<article class="project-stub">{{ project.name }}</article>' },
        WorkspaceDirectoryPicker: true,
      },
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  dashboardStore.projects.value = [];
  dashboardStore.workspaces.value = [];
  dashboardStore.selectedWorkspaceId.value = '';
  dashboardStore.newWorkspaceName.value = '';
  dashboardStore.newWorkspacePath.value = '';
  dashboardStore.loadingProjects.value = false;
});

describe('dashboard principal', () => {
  it('compõe a experiência Aurora, workspace e repositórios com Card', () => {
    const wrapper = mountView();
    expect(wrapper.findAll('[role="tab"]')).toHaveLength(0);
    expect(wrapper.get('.aurora-home-hero').text()).toContain('criar sem atrito');
    expect(wrapper.get('.aurora-overview').text()).toContain('projetos ativos');
    expect(wrapper.find('.workspace-panel').classes()).toContain('dd-card');
    expect(wrapper.findAll('.metric-card')).toHaveLength(4);
    expect(wrapper.find('.repositories-section').classes()).toContain('dd-card');
    expect(wrapper.get('.dd-status-badge').text()).toBe('Somente local');
  });

  it('preserva cadastro, seleção, scan e remoção de workspace', async () => {
    dashboardStore.workspaces.value = [workspace];
    dashboardStore.selectedWorkspaceId.value = workspace.id;
    const wrapper = mountView();

    await wrapper.get('select').setValue(workspace.id);
    await wrapper.get('.primary-button').trigger('click');
    await wrapper.get('.danger-button').trigger('click');
    await wrapper.get('form').trigger('submit');

    expect(actions.selecionar).toHaveBeenCalledOnce();
    expect(actions.escanear).toHaveBeenCalledOnce();
    expect(actions.remover).toHaveBeenCalledOnce();
    expect(actions.criar).toHaveBeenCalledOnce();
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
