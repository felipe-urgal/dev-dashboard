import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Project } from '@dev-dashboard/contracts';

const api = vi.hoisted(() => ({
  fetchMigrationOverview: vi.fn(),
  planMigrationMutation: vi.fn(),
  fetchMigrationMutationStatus: vi.fn(),
  prepareMigrationMutation: vi.fn(),
  startMigrationMutation: vi.fn(),
  cancelMigrationMutation: vi.fn(),
  migrationMutationWebSocketUrl: vi.fn(),
}));

const terminal = vi.hoisted(() => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  disposeTerminal: vi.fn(),
  onExit: vi.fn(),
}));

vi.mock('../src/api/migrations', async () => {
  const actual = await vi.importActual('../src/api/migrations');
  return { ...actual, ...api };
});

vi.mock('../src/composables/usePtyTerminalSocket', async () => {
  const { ref } = await import('vue');
  return {
    usePtyTerminalSocket: (handlers: {
      onExit: (exitCode: number | null, exitSignal: number | null) => void;
    }) => {
      terminal.onExit.mockImplementation(handlers.onExit);
      return {
        terminalContainer: ref(null),
        connecting: ref(false),
        connect: terminal.connect,
        disconnect: terminal.disconnect,
        disposeTerminal: terminal.disposeTerminal,
      };
    },
  };
});

import ProjectMigrationsPanel from '../src/components/ProjectMigrationsPanel.vue';

const project: Project = {
  id: 'project-1',
  workspaceId: 'workspace-1',
  name: 'Dashboard',
  path: '/projects/dashboard',
  type: 'rails',
  source: 'workspace',
  enabled: true,
  capabilities: ['database'],
};

const readyPlan = {
  projectId: project.id,
  provider: 'rails',
  operation: 'apply' as const,
  database: 'primary',
  environmentInstanceId: 'environment:primary:project-1',
  runtime: 'host' as const,
  createdAt: '2026-09-20T10:00:00.000Z',
  overviewObservedAt: '2026-09-07T16:00:00.000Z',
  planHash: 'a'.repeat(64),
  preflight: {
    state: 'ready' as const,
    reason: 'ready' as const,
    observedAt: '2026-09-07T16:00:00.000Z',
    evidence: 'Rails db:migrate:status',
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  api.fetchMigrationMutationStatus.mockResolvedValue(null);
  api.migrationMutationWebSocketUrl.mockReturnValue(
    'ws://localhost/api/projects/project-1/migrations/mutations/connect',
  );
});

describe('ProjectMigrationsPanel', () => {
  it('renderiza listas compactas e habilita apply somente quando o plano comum está ready', async () => {
    api.fetchMigrationOverview.mockResolvedValue({
      provider: 'rails',
      status: 'pending',
      database: 'primary',
      applied: Array.from({ length: 22 }, (_, index) => ({
        id: String(index + 1).padStart(3, '0'),
        name: `Migration ${index + 1}`,
      })),
      pending: [{ id: '023', name: 'Add audit index' }],
      observedAt: '2026-09-07T16:00:00.000Z',
      evidence: 'Rails db:migrate:status',
      warnings: ['Banco secundário não foi consultado.'],
    });
    api.planMigrationMutation.mockResolvedValue(readyPlan);
    api.prepareMigrationMutation.mockResolvedValue({
      token: 'confirmation-token',
      planHash: readyPlan.planHash,
      expiresAt: '2026-09-20T10:01:00.000Z',
    });
    api.startMigrationMutation.mockResolvedValue({
      provider: 'rails',
      operation: 'apply',
      database: 'primary',
      environmentInstanceId: readyPlan.environmentInstanceId,
      planHash: readyPlan.planHash,
      status: 'running',
      buffer: '',
      truncated: false,
      exitCode: null,
      exitSignal: null,
      startedAt: '2026-09-20T10:00:05.000Z',
      endedAt: null,
    });

    const wrapper = mount(ProjectMigrationsPanel, {
      props: {
        project,
        environmentInstanceId: readyPlan.environmentInstanceId,
      },
    });
    await flushPromises();

    expect(api.fetchMigrationOverview).toHaveBeenCalledWith(
      project.id,
      undefined,
      readyPlan.environmentInstanceId,
    );
    expect(api.planMigrationMutation).toHaveBeenCalledWith(
      project.id,
      'primary',
      readyPlan.environmentInstanceId,
    );
    expect(wrapper.text()).toContain('Pendente');
    expect(wrapper.find('.migrations-list-grid').exists()).toBe(true);
    expect(wrapper.text()).toContain('rails');
    expect(wrapper.text()).toContain('023');
    expect(wrapper.text()).toContain('Add audit index');
    expect(wrapper.text()).toContain('20 mais recentes de 22');
    expect(wrapper.text()).toContain('Aplicação disponível');
    expect(wrapper.text()).toContain('Revisar aplicação de 1 migration');
    expect(wrapper.text()).toContain(readyPlan.environmentInstanceId);
    expect(wrapper.text()).toContain('host');
    expect(wrapper.text()).toContain('Rails db:migrate:status');
    expect(wrapper.text()).toContain('Atualizar inspeção');

    await wrapper.get('.migrations-action .primary-button').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('Confirme o alvo antes de aplicar');
    expect(api.prepareMigrationMutation).not.toHaveBeenCalled();
    expect(api.startMigrationMutation).not.toHaveBeenCalled();
    await wrapper
      .get('.migrations-confirmation .primary-button')
      .trigger('click');
    await flushPromises();

    expect(api.prepareMigrationMutation).toHaveBeenCalledWith(
      project.id,
      readyPlan,
    );
    expect(api.startMigrationMutation).toHaveBeenCalledWith(
      project.id,
      readyPlan,
      'confirmation-token',
    );
    expect(terminal.connect).toHaveBeenCalledOnce();
    expect(wrapper.text()).toContain('Executando');
  });

  it('mantém providers sem mutation em modo somente leitura', async () => {
    api.fetchMigrationOverview.mockResolvedValue({
      provider: 'prisma',
      status: 'pending',
      database: 'primary',
      applied: [],
      pending: [{ id: '20260920', name: 'AddUser' }],
      observedAt: '2026-09-07T16:00:00.000Z',
      evidence: 'prisma migrate status',
      warnings: [],
    });
    api.planMigrationMutation.mockResolvedValue({
      ...readyPlan,
      provider: 'none',
      preflight: {
        state: 'unavailable',
        reason: 'provider-unavailable',
        observedAt: '2026-09-07T16:00:00.000Z',
        evidence: 'Migration mutation provider',
      },
    });

    const wrapper = mount(ProjectMigrationsPanel, { props: { project } });
    await flushPromises();

    expect(wrapper.text()).toContain('Somente leitura');
    expect(wrapper.text()).toContain(
      'Este provider ainda não possui execução comum habilitada.',
    );
    expect(wrapper.find('.migrations-action .primary-button').exists()).toBe(
      false,
    );
  });

  it('renderiza o estado indisponível no layout minimalista sem timeline ou contexto lateral', async () => {
    api.fetchMigrationOverview.mockResolvedValue({
      provider: 'none',
      status: 'unavailable',
      database: 'primary',
      applied: [],
      pending: [],
      observedAt: '2026-09-22T16:32:00.000Z',
      evidence: 'Inspeção de migrations indisponível.',
      warnings: [
        'Nenhum Migration Provider compatível foi encontrado para este projeto.',
      ],
    });
    api.planMigrationMutation.mockResolvedValue({
      ...readyPlan,
      provider: 'none',
      preflight: {
        state: 'unavailable',
        reason: 'provider-unavailable',
        observedAt: '2026-09-22T16:32:00.000Z',
        evidence: 'Migration mutation provider',
      },
    });

    const wrapper = mount(ProjectMigrationsPanel, { props: { project } });
    await flushPromises();

    expect(wrapper.text()).toContain('Indisponível');
    expect(wrapper.text()).toContain('Somente leitura');
    expect(wrapper.text()).toContain('Nenhuma migration disponível');
    expect(wrapper.text()).toContain(
      'Nenhum Migration Provider compatível foi encontrado para este projeto.',
    );
    expect(wrapper.find('.migrations-header').exists()).toBe(false);
    expect(wrapper.find('.migrations-meta').exists()).toBe(true);
    expect(wrapper.find('.migrations-counts').exists()).toBe(true);
    expect(wrapper.find('.migrations-empty').exists()).toBe(true);
    expect(wrapper.find('.migrations-list-grid').exists()).toBe(false);
    expect(wrapper.find('.migrations-action').exists()).toBe(false);
  });

  it('mostra o estado atualizado sem inventar atividade', async () => {
    api.fetchMigrationOverview.mockResolvedValue({
      provider: 'prisma',
      status: 'up-to-date',
      database: 'primary',
      applied: [],
      pending: [],
      observedAt: '2026-09-07T16:00:00.000Z',
      evidence: 'prisma migrate status',
      warnings: [],
    });
    api.planMigrationMutation.mockResolvedValue({
      ...readyPlan,
      provider: 'rails',
      preflight: {
        state: 'blocked',
        reason: 'nothing-pending',
        observedAt: '2026-09-07T16:00:00.000Z',
        evidence: 'prisma migrate status',
      },
    });

    const wrapper = mount(ProjectMigrationsPanel, { props: { project } });
    await flushPromises();

    expect(wrapper.text()).toContain('Atualizado');
    expect(wrapper.text()).toContain('Nenhuma migration pendente');
    expect(wrapper.text()).toContain(
      'Não há migrations pendentes para aplicar.',
    );
    expect(wrapper.text()).toContain('Preflight bloqueado');
  });

  it('mantém falha de inspeção explícita e permite retry', async () => {
    api.fetchMigrationOverview
      .mockRejectedValueOnce(new Error('Provider indisponível'))
      .mockResolvedValueOnce({
        provider: 'prisma',
        status: 'up-to-date',
        database: 'primary',
        applied: [],
        pending: [],
        observedAt: '2026-09-07T16:00:00.000Z',
        evidence: 'prisma migrate status',
        warnings: [],
      });
    api.planMigrationMutation.mockResolvedValue({
      ...readyPlan,
      preflight: {
        state: 'blocked',
        reason: 'nothing-pending',
        observedAt: '2026-09-07T16:00:00.000Z',
        evidence: 'prisma migrate status',
      },
    });

    const wrapper = mount(ProjectMigrationsPanel, { props: { project } });
    await flushPromises();

    expect(wrapper.text()).toContain('Provider indisponível');
    await wrapper.get('button').trigger('click');
    await flushPromises();

    expect(api.fetchMigrationOverview).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain('Atualizado');
  });
});

const pendingOverview = {
  provider: 'rails',
  status: 'pending' as const,
  database: 'primary',
  applied: [],
  pending: [{ id: '023', name: 'Add audit index' }],
  observedAt: '2026-09-07T16:00:00.000Z',
  evidence: 'Rails db:migrate:status',
  warnings: [],
};

const runningSnapshot = {
  provider: 'rails',
  operation: 'apply' as const,
  database: 'primary',
  environmentInstanceId: readyPlan.environmentInstanceId,
  planHash: readyPlan.planHash,
  status: 'running' as const,
  buffer: 'SQL secret masked: [REDACTED]',
  truncated: true,
  exitCode: null,
  exitSignal: null,
  startedAt: '2026-09-20T10:00:05.000Z',
  endedAt: null,
};

async function mountReadyPanel() {
  api.fetchMigrationOverview.mockResolvedValue(pendingOverview);
  api.planMigrationMutation.mockResolvedValue(readyPlan);
  api.fetchMigrationMutationStatus.mockResolvedValue(null);
  api.prepareMigrationMutation.mockResolvedValue({
    token: 'confirmation-token',
    planHash: readyPlan.planHash,
    expiresAt: '2026-09-20T10:01:00.000Z',
  });
  api.startMigrationMutation.mockResolvedValue(runningSnapshot);
  api.cancelMigrationMutation.mockResolvedValue(undefined);
  const wrapper = mount(ProjectMigrationsPanel, {
    props: { project, environmentInstanceId: readyPlan.environmentInstanceId },
  });
  await flushPromises();
  return wrapper;
}

describe('Migrations - confirmação e recuperação', () => {
  it('mantém a inspeção somente leitura se o preflight falhar', async () => {
    api.fetchMigrationOverview.mockResolvedValue(pendingOverview);
    api.planMigrationMutation.mockRejectedValue(new Error('Preflight indisponível'));
    const wrapper = mount(ProjectMigrationsPanel, {
      props: { project, environmentInstanceId: readyPlan.environmentInstanceId },
    });
    await flushPromises();

    expect(wrapper.text()).toContain('Add audit index');
    expect(wrapper.text()).toContain('Preflight indisponível');
    expect(wrapper.text()).toContain('Rails db:migrate:status');
    expect(wrapper.find('.migrations-action .primary-button').exists()).toBe(false);
    expect(wrapper.find('.migrations-inspection-bar button').exists()).toBe(true);
    wrapper.unmount();
  });

  it('não confirma nem executa antes da ação final; voltar cancela a revisão', async () => {
    const wrapper = await mountReadyPanel();
    await wrapper.get('.migrations-action .primary-button').trigger('click');

    expect(api.prepareMigrationMutation).not.toHaveBeenCalled();
    expect(api.startMigrationMutation).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Banco: primary');
    expect(wrapper.text()).toContain('Runtime: host');

    await wrapper
      .get('.migrations-confirmation .secondary-button')
      .trigger('click');
    expect(wrapper.find('.migrations-confirmation').exists()).toBe(false);
    expect(api.startMigrationMutation).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('rejeita plano alterado no backend e exige nova revisão', async () => {
    const wrapper = await mountReadyPanel();
    api.prepareMigrationMutation.mockRejectedValueOnce(
      Object.assign(new Error('Plano mudou'), {
        code: 'MIGRATION_MUTATION_PLAN_CHANGED',
      }),
    );
    await wrapper.get('.migrations-action .primary-button').trigger('click');
    await wrapper
      .get('.migrations-confirmation .primary-button')
      .trigger('click');
    await flushPromises();

    expect(api.startMigrationMutation).not.toHaveBeenCalled();
    expect(wrapper.find('.migrations-confirmation').exists()).toBe(false);
    expect(wrapper.text()).toContain('Revise a inspeção atual');
    expect(api.planMigrationMutation).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });

  it('rejeita token com planHash divergente antes do start', async () => {
    const wrapper = await mountReadyPanel();
    api.prepareMigrationMutation.mockResolvedValueOnce({
      token: 'invalid',
      planHash: 'b'.repeat(64),
      expiresAt: '2026-09-20T10:01:00.000Z',
    });
    await wrapper.get('.migrations-action .primary-button').trigger('click');
    await wrapper
      .get('.migrations-confirmation .primary-button')
      .trigger('click');
    await flushPromises();

    expect(api.startMigrationMutation).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('O plano ou ambiente mudou');
    wrapper.unmount();
  });

  it('troca de Environment Instance invalida a revisão e impede start atrasado', async () => {
    const wrapper = await mountReadyPanel();
    let release!: (value: {
      token: string;
      planHash: string;
      expiresAt: string;
    }) => void;
    api.prepareMigrationMutation.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    api.planMigrationMutation.mockImplementation(
      (_id: string, _database: string, environment: string) =>
        Promise.resolve({ ...readyPlan, environmentInstanceId: environment }),
    );

    await wrapper.get('.migrations-action .primary-button').trigger('click');
    await wrapper
      .get('.migrations-confirmation .primary-button')
      .trigger('click');
    await wrapper.setProps({
      environmentInstanceId: 'environment:worktree:new',
    });
    await flushPromises();
    expect(wrapper.find('.migrations-confirmation').exists()).toBe(false);
    expect(wrapper.text()).toContain('environment:worktree:new');
    expect(wrapper.text()).not.toContain(readyPlan.environmentInstanceId);

    release({
      token: 'old-token',
      planHash: readyPlan.planHash,
      expiresAt: '2026-09-20T10:01:00.000Z',
    });
    await flushPromises();
    expect(api.startMigrationMutation).not.toHaveBeenCalled();
    expect(terminal.disconnect).toHaveBeenCalled();
    expect(terminal.disposeTerminal).toHaveBeenCalled();
    wrapper.unmount();
  });

  it('double-click não inicia duas mutations', async () => {
    const wrapper = await mountReadyPanel();
    let release!: (value: {
      token: string;
      planHash: string;
      expiresAt: string;
    }) => void;
    api.prepareMigrationMutation.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    await wrapper.get('.migrations-action .primary-button').trigger('click');
    const button = wrapper.get('.migrations-confirmation .primary-button');
    await button.trigger('click');
    await button.trigger('click');

    expect(api.prepareMigrationMutation).toHaveBeenCalledTimes(1);
    expect(api.startMigrationMutation).not.toHaveBeenCalled();
    release({
      token: 'confirmation-token',
      planHash: readyPlan.planHash,
      expiresAt: '2026-09-20T10:01:00.000Z',
    });
    await flushPromises();

    expect(api.startMigrationMutation).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it('atualização manual invalida revisão, sem descartar execução e buffer', async () => {
    const wrapper = await mountReadyPanel();
    await wrapper.get('.migrations-action .primary-button').trigger('click');
    await wrapper.get('.migrations-inspection-bar button').trigger('click');
    await flushPromises();

    expect(wrapper.find('.migrations-confirmation').exists()).toBe(false);
    expect(api.startMigrationMutation).not.toHaveBeenCalled();
    wrapper.unmount();

    api.fetchMigrationMutationStatus.mockResolvedValue(runningSnapshot);
    const running = mount(ProjectMigrationsPanel, {
      props: {
        project,
        environmentInstanceId: readyPlan.environmentInstanceId,
      },
    });
    await flushPromises();
    expect(running.find('.migrations-output-note').exists()).toBe(true);
    expect(terminal.connect).toHaveBeenCalledTimes(1);
    const disconnects = terminal.disconnect.mock.calls.length;
    const disposes = terminal.disposeTerminal.mock.calls.length;
    await running.get('.migrations-inspection-bar button').trigger('click');
    await flushPromises();
    expect(terminal.connect).toHaveBeenCalledTimes(1);
    expect(terminal.disconnect.mock.calls.length).toBe(disconnects);
    expect(terminal.disposeTerminal.mock.calls.length).toBe(disposes);
    expect(running.text()).toContain('Executando');
    expect(running.find('.migrations-output-note').exists()).toBe(true);
    running.unmount();
  });

  it('reload reanexa snapshot/buffer truncado sem iniciar outro processo', async () => {
    api.fetchMigrationOverview.mockResolvedValue(pendingOverview);
    api.planMigrationMutation.mockResolvedValue(readyPlan);
    api.fetchMigrationMutationStatus.mockResolvedValue(runningSnapshot);

    const first = mount(ProjectMigrationsPanel, {
      props: {
        project,
        environmentInstanceId: readyPlan.environmentInstanceId,
      },
    });
    await flushPromises();
    first.unmount();
    const second = mount(ProjectMigrationsPanel, {
      props: {
        project,
        environmentInstanceId: readyPlan.environmentInstanceId,
      },
    });
    await flushPromises();

    expect(api.fetchMigrationMutationStatus).toHaveBeenCalledTimes(2);
    expect(terminal.connect).toHaveBeenCalledTimes(2);
    expect(api.startMigrationMutation).not.toHaveBeenCalled();
    expect(second.find('.migrations-output-note').text()).toContain('truncada');
    second.unmount();
  });

  it('cancelamento preserva snapshot final e atualiza overview e preflight', async () => {
    api.fetchMigrationOverview.mockResolvedValue(pendingOverview);
    api.planMigrationMutation.mockResolvedValue(readyPlan);
    api.fetchMigrationMutationStatus.mockResolvedValue(runningSnapshot);
    api.cancelMigrationMutation.mockResolvedValue(undefined);
    const wrapper = mount(ProjectMigrationsPanel, {
      props: {
        project,
        environmentInstanceId: readyPlan.environmentInstanceId,
      },
    });
    await flushPromises();
    await wrapper.get('.migrations-action .secondary-button').trigger('click');
    await flushPromises();

    expect(api.cancelMigrationMutation).toHaveBeenCalledWith(
      project.id,
      readyPlan.environmentInstanceId,
    );
    expect(wrapper.text()).toContain('Cancelando');
    terminal.onExit(130, 2);
    await flushPromises();

    expect(wrapper.text()).toContain('Falhou');
    expect(api.fetchMigrationOverview).toHaveBeenCalledTimes(2);
    expect(api.planMigrationMutation).toHaveBeenCalledTimes(2);
    expect(wrapper.find('.migrations-output-note').exists()).toBe(true);
    wrapper.unmount();
  });

  it.each([
    [0, 'Concluído'],
    [1, 'Falhou'],
  ])('saída %i refaz overview/preflight com estado %s', async (code, state) => {
    api.fetchMigrationOverview.mockResolvedValue(pendingOverview);
    api.planMigrationMutation.mockResolvedValue(readyPlan);
    api.fetchMigrationMutationStatus.mockResolvedValue(runningSnapshot);
    const wrapper = mount(ProjectMigrationsPanel, {
      props: {
        project,
        environmentInstanceId: readyPlan.environmentInstanceId,
      },
    });
    await flushPromises();
    api.fetchMigrationOverview.mockResolvedValue({
      ...pendingOverview,
      status: 'up-to-date',
      pending: [],
    });
    api.planMigrationMutation.mockResolvedValue({
      ...readyPlan,
      preflight: {
        ...readyPlan.preflight,
        state: 'blocked',
        reason: 'nothing-pending',
      },
    });

    terminal.onExit(code, null);
    await flushPromises();
    expect(wrapper.text()).toContain(state);
    expect(wrapper.text()).toContain('Nenhuma migration pendente');
    expect(wrapper.text()).toContain('Preflight bloqueado');
    expect(api.fetchMigrationOverview).toHaveBeenCalledTimes(2);
    expect(api.planMigrationMutation).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });
});
