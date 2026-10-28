import { computed } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Project, Workspace } from '@dev-dashboard/contracts';

const actions = vi.hoisted(() => ({
  escanear: vi.fn(),
  desativar: vi.fn(),
  iniciar: vi.fn(),
  parar: vi.fn(),
}));

vi.mock('../src/api', () => ({
  startProjectProcess: actions.iniciar,
  stopProjectProcess: actions.parar,
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
      scanWarnings: ref([]),
      scanStatus: ref('idle'),
      managedProcesses: ref([]),
      getCardProcess: () => null,
      processSummary: ref({ total: 0, active: 0, stopped: 0, failed: 0 }),
      loadingProcessSummary: ref(false),
      processSummaryError: ref(''),
      loadProcessSummary: vi.fn().mockResolvedValue(undefined),
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
  dashboardStore.scanWarnings.value = [];
  dashboardStore.scanStatus.value = 'idle';
  dashboardStore.managedProcesses.value = [];
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
  it('sem workspace oferece cadastrar um', () => {
    const wrapper = mountView();

    expect(wrapper.text()).toContain('Nenhum workspace cadastrado');
  });

  it('explica o workspace sem projetos e oferece atualizar', () => {
    dashboardStore.workspaces.value = [workspace];
    dashboardStore.selectedWorkspaceId.value = workspace.id;
    const wrapper = mountView();

    expect(wrapper.text()).toContain('Nenhum projeto neste workspace');
    expect(wrapper.text()).toContain(workspace.path);
  });

  it('lista os projetos e resume quantos estão rodando', () => {
    dashboardStore.projects.value = [project];
    const wrapper = mountView();

    expect(wrapper.get('.dashboard-summary').text()).toBe(
      '1 projeto · nenhum rodando',
    );
    expect(wrapper.findAll('.project-stub')).toHaveLength(1);
  });

  it('aciona a atualização do workspace pelo cabeçalho', async () => {
    dashboardStore.workspaces.value = [workspace];
    dashboardStore.selectedWorkspaceId.value = workspace.id;
    dashboardStore.lastScannedPath.value = workspace.path;
    const wrapper = mountView();

    const refresh = wrapper
      .findAll('.dashboard-header-button')
      .find((button) => button.text().includes('Atualizar'))!;
    await refresh.trigger('click');
    await flushPromises();

    expect(actions.escanear).toHaveBeenCalledOnce();
    expect(wrapper.find('[aria-label="Remover workspace"]').exists()).toBe(
      false,
    );
  });

  it('encaminha a ação individual de ativar ou desativar', async () => {
    dashboardStore.projects.value = [project];
    const wrapper = mountView();

    await wrapper.get('.toggle-enabled-stub').trigger('click');

    expect(actions.desativar).toHaveBeenCalledWith(project);
  });
});

describe('ações em lote', () => {
  it('inicia todos os servidores parados e informa os que falharam', async () => {
    dashboardStore.projects.value = [
      { ...project, id: 'p1', name: 'Alpha' },
      { ...project, id: 'p2', name: 'Bravo' },
    ];
    actions.iniciar.mockImplementation(async (id: string) => {
      if (id === 'p2') throw new Error('porta ocupada');
    });
    const wrapper = mountView();

    const startAll = wrapper
      .findAll('.dashboard-header-button')
      .find((button) => button.text().includes('Iniciar todos'))!;
    await startAll.trigger('click');
    await flushPromises();

    expect(actions.iniciar).toHaveBeenNthCalledWith(1, 'p1');
    expect(actions.iniciar).toHaveBeenNthCalledWith(2, 'p2');
    expect(dashboardStore.loadProcessSummary).toHaveBeenCalled();
    expect(wrapper.get('.dashboard-bulk-error').text()).toBe(
      'Não foi possível iniciar: Bravo.',
    );
  });
});

describe('warnings do workspace', () => {
  it('preserva os projetos mesmo com avisos parciais', () => {
    dashboardStore.projects.value = [project];
    dashboardStore.scanStatus.value = 'warnings';
    dashboardStore.scanWarnings.value = [
      { path: '/tmp/subfolder', code: 'READ_ERROR', message: 'Sem permissão' },
    ];
    const wrapper = mountView();
    expect(wrapper.findAll('.project-stub')).toHaveLength(1);
    expect(wrapper.get('.dashboard-scan-warning').text()).toContain(
      'Descoberta parcial',
    );
  });
});
