import { computed, nextTick } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
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
  const selectedWorkspace = computed(() =>
    workspaces.value.find(
      (workspace) => workspace.id === selectedWorkspaceId.value,
    ),
  );

  return {
    dashboardStore: {
      projects,
      workspaces,
      selectedWorkspaceId,
      selectedWorkspace,
      loadingProjects: ref(false),
      scanningWorkspace: ref(false),
      enabledUpdatingIds: ref<string[]>([]),
      errorMessage: ref(''),
      processSummary: ref({ total: 0, active: 0, stopped: 0, failed: 0 }),
      loadingProcessSummary: ref(false),
      processSummaryError: ref(''),
      loadProcessSummary: vi.fn(),
      lastScannedPath: ref(''),
      ensureDashboardLoaded: vi.fn(),
      rescanSelectedWorkspace: actions.escanear,
      toggleProjectEnabled: actions.desativar,
    },
  };
});

import { dashboardStore } from '../src/stores/dashboard';
import DashboardView from '../src/views/DashboardView.vue';

const workspace: Workspace = {
  id: 'w1',
  name: 'Projetos Pessoais',
  path: '/home/ubuntu/Caiena/Projetos',
  enabled: true,
  recursiveScan: false,
};

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
  actions.escanear.mockResolvedValue(undefined);

  dashboardStore.projects.value = [];
  dashboardStore.workspaces.value = [];
  dashboardStore.selectedWorkspaceId.value = '';
  dashboardStore.loadingProjects.value = false;
  dashboardStore.scanningWorkspace.value = false;
  dashboardStore.enabledUpdatingIds.value = [];
  dashboardStore.errorMessage.value = '';
  dashboardStore.processSummary.value = {
    total: 0,
    active: 0,
    stopped: 0,
    failed: 0,
  };
  dashboardStore.loadingProcessSummary.value = false;
  dashboardStore.processSummaryError.value = '';
  dashboardStore.lastScannedPath.value = '';
});

describe('dashboard principal', () => {
  it('renderiza a visão minimalista e o estado vazio', () => {
    const wrapper = mountView();

    expect(wrapper.find('.dashboard-primary').exists()).toBe(true);
    expect(wrapper.find('.dashboard-rail').exists()).toBe(false);
    expect(wrapper.find('.dashboard-toolbar').exists()).toBe(false);
    expect(wrapper.find('.dashboard-search').exists()).toBe(false);
    expect(wrapper.text()).toContain('Projetos pessoais');
    expect(wrapper.text()).toContain('Nenhum projeto carregado');
  });

  it('renderiza somente cabeçalhos e lista de projetos', () => {
    dashboardStore.projects.value = [project];
    const wrapper = mountView();

    expect(wrapper.get('.dashboard-project-columns').text()).toContain(
      'Projeto',
    );
    expect(wrapper.get('.dashboard-project-columns').text()).toContain(
      'Status',
    );
    expect(wrapper.get('.dashboard-project-columns').text()).toContain('Ações');
    expect(wrapper.find('.dashboard-tabs').exists()).toBe(false);
    expect(wrapper.find('.dashboard-filter-button').exists()).toBe(false);
    expect(wrapper.findAll('.project-stub')).toHaveLength(1);
  });

  it('oculta o próprio dev-dashboard da listagem', () => {
    dashboardStore.projects.value = [
      project,
      {
        ...project,
        id: 'dev-dashboard',
        name: 'dev-dashboard',
        path: '/home/ubuntu/Projetos/dev-dashboard',
      },
    ];

    const wrapper = mountView();

    expect(wrapper.findAll('.project-stub')).toHaveLength(1);
    expect(wrapper.text()).toContain('Projeto Node');
    expect(wrapper.text()).not.toContain('dev-dashboard');
  });

  it('aciona a atualização do workspace pelo cabeçalho', async () => {
    dashboardStore.workspaces.value = [workspace];
    dashboardStore.selectedWorkspaceId.value = workspace.id;
    dashboardStore.lastScannedPath.value = workspace.path;
    const wrapper = mountView();

    await wrapper.get('.dashboard-refresh-button').trigger('click');
    await flushPromises();

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

    expect(wrapper.find('.dashboard-project-list').exists()).toBe(true);
    expect(wrapper.get('.project-stub').text()).toContain('Projeto Node');
  });

  it('encaminha a ação individual de ativar ou desativar', async () => {
    dashboardStore.projects.value = [project];
    const wrapper = mountView();

    await wrapper.get('.toggle-enabled-stub').trigger('click');

    expect(actions.desativar).toHaveBeenCalledWith(project);
  });
});
