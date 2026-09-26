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
}));

vi.mock('../src/api/migrations', async () => {
  const actual = await vi.importActual('../src/api/migrations');
  return { ...actual, ...api };
});

vi.mock('../src/composables/usePtyTerminalSocket', async () => {
  const { ref } = await import('vue');
  return {
    usePtyTerminalSocket: () => ({
      terminalContainer: ref(null),
      connecting: ref(false),
      connect: terminal.connect,
      disconnect: terminal.disconnect,
      disposeTerminal: terminal.disposeTerminal,
    }),
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
    expect(wrapper.text()).toContain('Aplicar 1 migration');

    await wrapper.get('.migrations-action .primary-button').trigger('click');
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
    expect(wrapper.text()).not.toContain('Aplicar 1 migration');
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
    expect(wrapper.text()).toContain('Somente leitura');
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
