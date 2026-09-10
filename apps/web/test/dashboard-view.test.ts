import { computed, nextTick } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Project, Workspace } from '@dev-dashboard/contracts';

const actions = vi.hoisted(() => ({
  escanear: vi.fn(),
  desativar: vi.fn(),
  atencao: vi.fn(),
}));

vi.mock('../src/api', () => ({
  fetchWorkspaceAttention: actions.atencao,
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
      successMessage: ref(''),
      warningCount: ref(0),
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
        RouterLink: {
          props: ['to'],
          template:
            '<a class="router-link-stub" :data-route="to.name" :data-status="to.query?.status || \'\'"><slot /></a>',
        },
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
  actions.atencao.mockResolvedValue({
    workspaceId: 'w1',
    generatedAt: new Date(0).toISOString(),
    partial: false,
    unavailableSources: [],
    items: [],
  });

  dashboardStore.projects.value = [];
  dashboardStore.workspaces.value = [];
  dashboardStore.selectedWorkspaceId.value = '';
  dashboardStore.loadingProjects.value = false;
  dashboardStore.scanningWorkspace.value = false;
  dashboardStore.enabledUpdatingIds.value = [];
  dashboardStore.errorMessage.value = '';
  dashboardStore.successMessage.value = '';
  dashboardStore.warningCount.value = 0;
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
  it('renderiza a estrutura Mission Control e o estado vazio', () => {
    const wrapper = mountView();

    expect(wrapper.find('.dashboard-layout').exists()).toBe(true);
    expect(wrapper.find('.dashboard-primary').exists()).toBe(true);
    expect(wrapper.find('.dashboard-rail').exists()).toBe(true);
    expect(wrapper.find('.overview-summary-card').exists()).toBe(false);
    expect(wrapper.text()).toContain('Projetos pessoais');
    expect(wrapper.text()).toContain('Nenhum projeto carregado');
  });

  it('renderiza busca, contagem e lista de projetos conforme o protótipo', () => {
    dashboardStore.projects.value = [project];
    const wrapper = mountView();

    expect(wrapper.find('.dashboard-search input').exists()).toBe(true);
    expect(wrapper.find('.dashboard-filter-button').exists()).toBe(true);
    expect(wrapper.text()).toContain('Todos os projetos (1)');
    expect(wrapper.find('[aria-label="Iniciar servidores"]').exists()).toBe(
      false,
    );
    expect(wrapper.find('[aria-label="Parar servidores"]').exists()).toBe(
      false,
    );
    expect(wrapper.findAll('.project-stub')).toHaveLength(1);
  });

  it('aciona a atualização do workspace pelo cabeçalho', async () => {
    dashboardStore.workspaces.value = [workspace];
    dashboardStore.selectedWorkspaceId.value = workspace.id;
    dashboardStore.lastScannedPath.value = workspace.path;
    const wrapper = mountView();

    await flushPromises();
    await wrapper.get('.dashboard-refresh-button').trigger('click');
    await flushPromises();

    expect(actions.escanear).toHaveBeenCalledOnce();
    expect(actions.atencao).toHaveBeenCalled();
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
