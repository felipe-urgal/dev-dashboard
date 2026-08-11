import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Project, Workspace } from '@dev-dashboard/contracts';

const actions = vi.hoisted(() => ({
  escanear: vi.fn(),
  remover: vi.fn(),
  buscarProcessos: vi.fn(),
  iniciarProcesso: vi.fn(),
  pararProcesso: vi.fn(),
  favoritar: vi.fn(),
  desativar: vi.fn(),
  removerProjeto: vi.fn(),
}));

vi.mock('../src/api', () => ({
  fetchManagedProcesses: actions.buscarProcessos,
  startProjectProcess: actions.iniciarProcesso,
  stopProjectProcess: actions.pararProcesso,
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
      favoriteUpdatingIds: ref<string[]>([]),
      enabledUpdatingIds: ref<string[]>([]),
      dismissingProjectIds: ref<string[]>([]),
      errorMessage: ref(''),
      successMessage: ref(''),
      warningCount: ref(0),
      lastScannedPath: ref(''),
      selectedWorkspace: computed(() =>
        workspaces.value.find((item) => item.id === selectedWorkspaceId.value),
      ),
      sortedProjects: computed(() =>
        [...projects.value].sort(
          (a, b) =>
            Number(b.favorite) - Number(a.favorite) ||
            a.name.localeCompare(b.name),
        ),
      ),
      rescanSelectedWorkspace: actions.escanear,
      handleDeleteWorkspace: actions.remover,
      toggleProjectFavorite: actions.favoritar,
      toggleProjectEnabled: actions.desativar,
      removeProject: actions.removerProjeto,
    },
  };
});

import { dashboardStore } from '../src/stores/dashboard';
import DashboardView from '../src/views/DashboardView.vue';

const project: Project = {
  id: 'p1',
  workspaceId: 'w1',
  name: 'Favorito',
  path: '/projetos/favorito',
  type: 'node',
  source: 'workspace',
  favorite: true,
  enabled: true,
  capabilities: ['git'],
};

function mountView() {
  return mount(DashboardView, {
    global: {
      stubs: {
        ProjectCard: {
          props: ['project', 'favoriteUpdating'],
          emits: ['toggle-favorite'],
          template:
            '<li class="project-stub" @click="$emit(\'toggle-favorite\', project)">{{ project.name }}</li>',
        },
      },
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  actions.buscarProcessos.mockResolvedValue([]);
  actions.iniciarProcesso.mockImplementation(async (projectId: string) => ({
    id: `process-${projectId}`,
    projectId,
    kind: 'server',
    status: 'starting',
  }));
  actions.pararProcesso.mockImplementation(async (projectId: string) => ({
    id: `process-${projectId}`,
    projectId,
    kind: 'server',
    status: 'stopped',
  }));
  dashboardStore.projects.value = [];
  dashboardStore.workspaces.value = [];
  dashboardStore.selectedWorkspaceId.value = '';
  dashboardStore.loadingProjects.value = false;
  dashboardStore.lastScannedPath.value = '';
  dashboardStore.favoriteUpdatingIds.value = [];
});

afterEach(() => {
  vi.useRealTimers();
});

describe('dashboard principal', () => {
  it('não renderiza hero nem formulário de workspace, só repositórios em Card', () => {
    const wrapper = mountView();
    expect(wrapper.find('.hero-copy').exists()).toBe(false);
    expect(wrapper.find('.workspace-panel').exists()).toBe(false);
    expect(wrapper.find('.workspace-create-form').exists()).toBe(false);
    expect(wrapper.find('.metrics-grid').exists()).toBe(false);
    expect(wrapper.find('.repositories-section').classes()).toContain(
      'dd-card',
    );
  });

  it('lista projetos em .projects-list em vez de grid de cards', () => {
    dashboardStore.projects.value = [project];
    const wrapper = mountView();
    expect(wrapper.find('.projects-list').exists()).toBe(true);
    expect(wrapper.find('.projects-grid').exists()).toBe(false);
  });

  it('aciona escanear/remover a partir das ações compactas do cabeçalho', async () => {
    dashboardStore.lastScannedPath.value = '/home/ubunru/Caiena/Projetos';
    const wrapper = mountView();

    await wrapper
      .get('[aria-label="Escanear novamente e restaurar projetos removidos"]')
      .trigger('click');
    await wrapper.get('[aria-label="Remover workspace"]').trigger('click');

    expect(actions.escanear).toHaveBeenCalledOnce();
    expect(actions.remover).toHaveBeenCalledOnce();
  });

  it('mantém os estados de carregamento, vazio e projetos favoritos', async () => {
    vi.useFakeTimers();
    dashboardStore.loadingProjects.value = true;
    const wrapper = mountView();
    expect(wrapper.get('#overview').attributes('aria-busy')).toBe('true');
    expect(wrapper.get('[role="status"]').text()).toContain(
      'Carregando projetos detectados',
    );
    expect(wrapper.find('.loading-skeleton-list').exists()).toBe(false);

    await vi.advanceTimersByTimeAsync(150);
    expect(wrapper.findAll('.loading-skeleton-row')).toHaveLength(3);

    dashboardStore.loadingProjects.value = false;
    await nextTick();
    expect(wrapper.get('#overview').attributes('aria-busy')).toBe('false');
    expect(wrapper.text()).toContain('Nenhum projeto carregado');

    dashboardStore.projects.value = [project];
    await nextTick();
    expect(wrapper.get('.project-stub').text()).toBe('Favorito');

    await wrapper.get('.project-stub').trigger('click');
    expect(actions.favoritar).toHaveBeenCalledWith(project);
  });

  it('mantém a visão geral sem busca nem filtro de tipo e move start/stop para o resumo', () => {
    dashboardStore.projects.value = [
      { ...project, capabilities: ['git', 'server'] },
      {
        ...project,
        id: 'p2',
        name: 'Painel Rails',
        path: '/projetos/painel-rails',
        type: 'rails',
      },
    ];
    const wrapper = mountView();

    expect(wrapper.find('.project-search').exists()).toBe(false);
    expect(wrapper.find('.project-filter-menu').exists()).toBe(false);
    expect(wrapper.findAll('.project-stub')).toHaveLength(2);

    const summary = wrapper.get('.repository-title-row');
    expect(
      summary.find('[aria-label="Iniciar servidores"]').exists(),
    ).toBe(true);
    expect(
      summary.find('[aria-label="Parar servidores"]').exists(),
    ).toBe(true);

    const headerActions = wrapper.get('.compact-actions');
    expect(
      headerActions.find('[aria-label="Iniciar servidores"]').exists(),
    ).toBe(false);
    expect(
      headerActions.find('[aria-label="Parar servidores"]').exists(),
    ).toBe(false);
  });

  it('inicia todos os servidores parados e ignora os que já estão ativos', async () => {
    actions.buscarProcessos.mockResolvedValue([
      {
        id: 'process-p1',
        projectId: 'p1',
        kind: 'server',
        status: 'running',
      },
    ]);
    dashboardStore.selectedWorkspaceId.value = 'w1';
    dashboardStore.projects.value = [
      { ...project, capabilities: ['git', 'server'] },
      {
        ...project,
        id: 'p2',
        name: 'API',
        capabilities: ['server'],
      },
      {
        ...project,
        id: 'p3',
        name: 'Documentação',
        capabilities: ['git'],
      },
    ];

    const wrapper = mountView();
    await vi.waitFor(() => {
      expect(actions.buscarProcessos).toHaveBeenCalledWith({
        workspaceId: 'w1',
        kind: 'server',
      });
      expect(
        wrapper.get('[aria-label="Iniciar servidores"]').attributes('disabled'),
      ).toBeUndefined();
    });

    await wrapper.get('[aria-label="Iniciar servidores"]').trigger('click');
    await vi.waitFor(() => {
      expect(actions.iniciarProcesso).toHaveBeenCalledOnce();
    });

    expect(actions.iniciarProcesso).toHaveBeenCalledWith('p2');
    expect(wrapper.text()).toContain('1 servidor iniciado.');
    expect(
      wrapper.get('[aria-label="Iniciar servidores"]').attributes('disabled'),
    ).toBeDefined();
  });

  it('informa os projetos que falharam sem perder os servidores iniciados', async () => {
    dashboardStore.projects.value = [
      { ...project, capabilities: ['server'] },
      {
        ...project,
        id: 'p2',
        name: 'API',
        capabilities: ['server'],
      },
    ];
    actions.iniciarProcesso
      .mockResolvedValueOnce({
        id: 'process-p1',
        projectId: 'p1',
        kind: 'server',
        status: 'starting',
      })
      .mockRejectedValueOnce(new Error('porta ocupada'));

    const wrapper = mountView();
    await vi.waitFor(() => {
      expect(
        wrapper.get('[aria-label="Iniciar servidores"]').attributes('disabled'),
      ).toBeUndefined();
    });

    await wrapper.get('[aria-label="Iniciar servidores"]').trigger('click');
    await vi.waitFor(() => {
      expect(actions.iniciarProcesso).toHaveBeenCalledTimes(2);
    });

    expect(wrapper.text()).toContain(
      '1 servidor iniciado. Não foi possível iniciar: Favorito.',
    );
    expect(
      wrapper.get('[aria-label="Iniciar servidores"]').attributes('disabled'),
    ).toBeUndefined();
  });

  it('mantém a ação indisponível quando não consegue verificar os processos', async () => {
    actions.buscarProcessos.mockRejectedValue(
      new Error('Não foi possível consultar os processos.'),
    );
    dashboardStore.projects.value = [{ ...project, capabilities: ['server'] }];

    const wrapper = mountView();
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain(
        'Não foi possível consultar os processos.',
      );
    });

    expect(
      wrapper.get('[aria-label="Iniciar servidores"]').attributes('disabled'),
    ).toBeDefined();
    expect(
      wrapper.get('[aria-label="Iniciar servidores"]').attributes('title'),
    ).toBe('Não foi possível verificar os servidores disponíveis.');
    expect(
      wrapper.get('[aria-label="Parar servidores"]').attributes('disabled'),
    ).toBeDefined();
    expect(
      wrapper.get('[aria-label="Parar servidores"]').attributes('title'),
    ).toBe('Não foi possível verificar os servidores em execução.');
  });

  it('para todos os servidores ativos e ignora os projetos parados', async () => {
    actions.buscarProcessos.mockResolvedValue([
      {
        id: 'process-p1',
        projectId: 'p1',
        kind: 'server',
        status: 'running',
      },
    ]);
    dashboardStore.selectedWorkspaceId.value = 'w1';
    dashboardStore.projects.value = [
      { ...project, capabilities: ['git', 'server'] },
      {
        ...project,
        id: 'p2',
        name: 'API',
        capabilities: ['server'],
      },
    ];

    const wrapper = mountView();
    await vi.waitFor(() => {
      expect(
        wrapper.get('[aria-label="Parar servidores"]').attributes('disabled'),
      ).toBeUndefined();
    });

    await wrapper.get('[aria-label="Parar servidores"]').trigger('click');
    await vi.waitFor(() => {
      expect(actions.pararProcesso).toHaveBeenCalledOnce();
    });

    expect(actions.pararProcesso).toHaveBeenCalledWith('p1');
    expect(wrapper.text()).toContain('1 servidor parado.');
    expect(
      wrapper.get('[aria-label="Parar servidores"]').attributes('disabled'),
    ).toBeDefined();
    expect(
      wrapper.get('[aria-label="Iniciar servidores"]').attributes('disabled'),
    ).toBeUndefined();
  });

  it('informa os servidores que falharam ao parar sem perder os demais resultados', async () => {
    actions.buscarProcessos.mockResolvedValue([
      {
        id: 'process-p1',
        projectId: 'p1',
        kind: 'server',
        status: 'running',
      },
      {
        id: 'process-p2',
        projectId: 'p2',
        kind: 'server',
        status: 'running',
      },
    ]);
    dashboardStore.projects.value = [
      { ...project, capabilities: ['server'] },
      {
        ...project,
        id: 'p2',
        name: 'API',
        capabilities: ['server'],
      },
    ];
    actions.pararProcesso
      .mockResolvedValueOnce({
        id: 'process-p2',
        projectId: 'p2',
        kind: 'server',
        status: 'stopped',
      })
      .mockRejectedValueOnce(new Error('falha ao encerrar'));

    const wrapper = mountView();
    await vi.waitFor(() => {
      expect(
        wrapper.get('[aria-label="Parar servidores"]').attributes('disabled'),
      ).toBeUndefined();
    });

    await wrapper.get('[aria-label="Parar servidores"]').trigger('click');
    await vi.waitFor(() => {
      expect(actions.pararProcesso).toHaveBeenCalledTimes(2);
    });

    expect(wrapper.text()).toContain(
      '1 servidor parado. Não foi possível parar: Favorito.',
    );
    expect(
      wrapper.get('[aria-label="Parar servidores"]').attributes('disabled'),
    ).toBeUndefined();
  });
});
