import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Project, Workspace } from '@dev-dashboard/contracts';

const actions = vi.hoisted(() => ({
  escanear: vi.fn(),
  desativar: vi.fn(),
}));

vi.mock('../src/stores/dashboard', async () => {
  const { ref } = await import('vue');
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
      enabledUpdatingIds: ref<string[]>([]),
      errorMessage: ref(''),
      successMessage: ref(''),
      warningCount: ref(0),
      lastScannedPath: ref(''),
      rescanSelectedWorkspace: actions.escanear,
      toggleProjectEnabled: actions.desativar,
    },
  };
});

import { dashboardStore } from '../src/stores/dashboard';
import DashboardView from '../src/views/DashboardView.vue';

const project: Project = {
  id: 'p1',
  workspaceId: 'w1',
  name: 'Projeto Node',
  path: '/projetos/projeto-node',
  type: 'node',
  source: 'workspace',
  enabled: true,
  capabilities: ['git', 'server'],
};

function mountView() {
  return mount(DashboardView, {
    global: {
      stubs: {
        ProjectCard: {
          props: ['project', 'enabledUpdating'],
          emits: ['toggle-enabled'],
          template:
            '<li class="project-stub">{{ project.name }}<button class="toggle-enabled-stub" @click="$emit(\'toggle-enabled\', project)">alternar</button></li>',
        },
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
  dashboardStore.scanningWorkspace.value = false;
  dashboardStore.enabledUpdatingIds.value = [];
  dashboardStore.errorMessage.value = '';
  dashboardStore.successMessage.value = '';
  dashboardStore.warningCount.value = 0;
  dashboardStore.lastScannedPath.value = '';
});

describe('dashboard principal', () => {
  it('mantém a visão geral enxuta dentro do Card de repositórios', () => {
    const wrapper = mountView();

    expect(wrapper.find('.hero-copy').exists()).toBe(false);
    expect(wrapper.find('.workspace-panel').exists()).toBe(false);
    expect(wrapper.find('.workspace-create-form').exists()).toBe(false);
    expect(wrapper.find('.metrics-grid').exists()).toBe(false);
    expect(wrapper.find('.repositories-section').classes()).toContain(
      'dd-card',
    );
    expect(wrapper.text()).toContain('Repositórios');
  });

  it('remove filtros, contagem, título redundante e ações globais de servidor', () => {
    dashboardStore.projects.value = [project];
    const wrapper = mountView();

    expect(wrapper.find('.project-search').exists()).toBe(false);
    expect(wrapper.find('.project-filter-menu').exists()).toBe(false);
    expect(wrapper.find('.section-count').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Projetos detectados');
    expect(wrapper.find('[aria-label="Iniciar servidores"]').exists()).toBe(
      false,
    );
    expect(wrapper.find('[aria-label="Parar servidores"]').exists()).toBe(
      false,
    );
    expect(
      wrapper.find('[aria-label="Controles dos servidores"]').exists(),
    ).toBe(false);
    expect(wrapper.findAll('.project-stub')).toHaveLength(1);
  });

  it('aciona a atualização do workspace pelo cabeçalho', async () => {
    dashboardStore.lastScannedPath.value = '/home/ubuntu/Caiena/Projetos';
    const wrapper = mountView();

    await wrapper
      .get('[aria-label="Escanear novamente e restaurar projetos removidos"]')
      .trigger('click');
    expect(actions.escanear).toHaveBeenCalledOnce();
    expect(wrapper.find('[aria-label="Remover workspace"]').exists()).toBe(
      false,
    );
  });

  it('renderiza o estado vazio e depois a lista de projetos', async () => {
    const wrapper = mountView();
    expect(wrapper.text()).toContain('Nenhum projeto carregado');

    dashboardStore.projects.value = [project];
    await nextTick();

    expect(wrapper.find('.projects-list').exists()).toBe(true);
    expect(wrapper.get('.project-stub').text()).toContain('Projeto Node');
  });

  it('encaminha a ação individual de ativar ou desativar', async () => {
    dashboardStore.projects.value = [project];
    const wrapper = mountView();

    await wrapper.get('.toggle-enabled-stub').trigger('click');

    expect(actions.desativar).toHaveBeenCalledWith(project);
  });
});
