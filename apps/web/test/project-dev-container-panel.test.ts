import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Project } from '@dev-dashboard/contracts';

const fetchDevContainerLifecyclePreflight = vi.hoisted(() => vi.fn());
const fetchDevContainerLifecycleExecution = vi.hoisted(() => vi.fn());
const prepareDevContainerLifecycleConfirmation = vi.hoisted(() => vi.fn());
const prepareDevContainerStopConfirmation = vi.hoisted(() => vi.fn());
const startDevContainerLifecycleExecution = vi.hoisted(() => vi.fn());
const cancelDevContainerLifecycleExecution = vi.hoisted(() => vi.fn());

vi.mock('../src/api/dev-container', () => ({
  fetchDevContainerLifecyclePreflight: (...args: unknown[]) =>
    fetchDevContainerLifecyclePreflight(...args),
  fetchDevContainerLifecycleExecution: (...args: unknown[]) =>
    fetchDevContainerLifecycleExecution(...args),
  prepareDevContainerLifecycleConfirmation: (...args: unknown[]) =>
    prepareDevContainerLifecycleConfirmation(...args),
  prepareDevContainerStopConfirmation: (...args: unknown[]) =>
    prepareDevContainerStopConfirmation(...args),
  startDevContainerLifecycleExecution: (...args: unknown[]) =>
    startDevContainerLifecycleExecution(...args),
  cancelDevContainerLifecycleExecution: (...args: unknown[]) =>
    cancelDevContainerLifecycleExecution(...args),
}));

import ProjectDevContainerPanel from '../src/components/ProjectDevContainerPanel.vue';

const project: Project = {
  id: 'project-devcontainer',
  workspaceId: 'workspace-1',
  name: 'Projeto',
  path: '/workspace/project',
  type: 'node',
  source: 'workspace',
  enabled: true,
  capabilities: [],
};

const ENVIRONMENT = 'environment:primary:project-devcontainer';

function hostPreflight(overrides: Record<string, unknown> = {}) {
  return {
    projectId: project.id,
    operation: 'create',
    state: 'review',
    reason: 'review-required',
    observedAt: '2026-10-02T10:00:00.000Z',
    environmentInstanceId: ENVIRONMENT,
    runtime: 'host',
    environmentLifecycle: 'ready',
    stopAvailable: false,
    recoveryAvailable: false,
    executionEnabled: false,
    requiresConfirmation: true,
    discoveryState: 'available',
    configSource: '.devcontainer/devcontainer.json',
    cliVersion: '0.80.1',
    configuration: {
      kind: 'image',
      name: 'Workspace',
      lifecycleHooks: ['postCreateCommand'],
    },
    limitations: ['post-create-hooks-deferred'],
    diagnostic: 'A configuração pode avançar para revisão humana.',
    ...overrides,
  };
}

function runtimePreflight(overrides: Record<string, unknown> = {}) {
  return hostPreflight({
    operation: 'rebuild',
    runtime: 'devcontainer',
    environmentLifecycle: 'ready',
    stopAvailable: true,
    requiresConfirmation: true,
    diagnostic: 'O Dev Container owned pode avançar para rebuild.',
    ...overrides,
  });
}

describe('ProjectDevContainerPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchDevContainerLifecycleExecution.mockResolvedValue(null);
  });

  it('separa estado saudável da ação de criação disponível', async () => {
    fetchDevContainerLifecyclePreflight.mockResolvedValueOnce(hostPreflight());

    const wrapper = mount(ProjectDevContainerPanel, {
      props: { project, environmentInstanceId: ENVIRONMENT },
    });
    await flushPromises();

    expect(fetchDevContainerLifecyclePreflight).toHaveBeenCalledWith(
      project.id,
      ENVIRONMENT,
    );
    expect(fetchDevContainerLifecycleExecution).toHaveBeenCalledWith(
      project.id,
      ENVIRONMENT,
    );
    expect(wrapper.text()).toContain('Pronto');
    expect(wrapper.text()).toContain('Runtime');
    expect(wrapper.text()).toContain('Host');
    expect(wrapper.text()).toContain('Lifecycle');
    expect(wrapper.text()).toContain('Ready');
    expect(wrapper.text()).toContain('Imagem');
    expect(wrapper.text()).toContain('Criar');
    expect(wrapper.text()).not.toContain('Revisão necessária');
    expect(wrapper.text()).toContain('Criação disponível mediante confirmação');
    wrapper.unmount();
  });

  it('valida operação da confirmação e inicia create como lifecycle job', async () => {
    fetchDevContainerLifecyclePreflight.mockResolvedValueOnce(hostPreflight());
    prepareDevContainerLifecycleConfirmation.mockResolvedValueOnce({
      token: 'a'.repeat(64),
      environmentInstanceId: ENVIRONMENT,
      operation: 'create',
      expiresAt: '2026-10-02T10:01:00.000Z',
    });
    startDevContainerLifecycleExecution.mockResolvedValueOnce({
      id: 'execution-1',
      projectId: project.id,
      environmentInstanceId: ENVIRONMENT,
      operation: 'create',
      status: 'queued',
      stage: 'queued',
      cancelSupported: true,
      startedAt: '2026-10-02T10:00:00.000Z',
    });

    const wrapper = mount(ProjectDevContainerPanel, {
      props: { project, environmentInstanceId: ENVIRONMENT },
    });
    await flushPromises();

    await wrapper.get('.devcontainer-create').trigger('click');
    expect(wrapper.text()).toContain('Criar este Dev Container?');

    await wrapper.get('.devcontainer-confirm-action').trigger('click');
    await flushPromises();

    expect(prepareDevContainerLifecycleConfirmation).toHaveBeenCalledWith(
      project.id,
      ENVIRONMENT,
    );
    expect(startDevContainerLifecycleExecution).toHaveBeenCalledWith(
      project.id,
      'create',
      'a'.repeat(64),
      ENVIRONMENT,
    );
    expect(wrapper.text()).toContain('Criação');
    expect(wrapper.text()).toContain('Aguardando');
    wrapper.unmount();
  });

  it('reanexa job em andamento após reload e permite cancelamento seguro', async () => {
    fetchDevContainerLifecyclePreflight.mockResolvedValueOnce(
      hostPreflight({
        state: 'blocked',
        reason: 'lifecycle-in-progress',
        environmentLifecycle: 'starting',
        recoveryAvailable: true,
        requiresConfirmation: false,
        diagnostic: 'A criação ainda está em andamento.',
      }),
    );
    fetchDevContainerLifecycleExecution.mockResolvedValueOnce({
      id: 'execution-running',
      projectId: project.id,
      environmentInstanceId: ENVIRONMENT,
      operation: 'create',
      status: 'running',
      stage: 'creating-runtime',
      cancelSupported: true,
      startedAt: '2026-10-02T10:00:00.000Z',
    });
    cancelDevContainerLifecycleExecution.mockResolvedValueOnce(undefined);
    fetchDevContainerLifecycleExecution.mockResolvedValueOnce({
      id: 'execution-running',
      projectId: project.id,
      environmentInstanceId: ENVIRONMENT,
      operation: 'create',
      status: 'running',
      stage: 'cancelling',
      cancelSupported: true,
      startedAt: '2026-10-02T10:00:00.000Z',
    });

    const wrapper = mount(ProjectDevContainerPanel, {
      props: { project, environmentInstanceId: ENVIRONMENT },
    });
    await flushPromises();

    expect(wrapper.text()).toContain('Criando');
    expect(wrapper.text()).toContain('Etapa: creating-runtime');
    const cancel = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Cancelar operação'));
    expect(cancel).toBeDefined();

    await cancel!.trigger('click');
    await flushPromises();

    expect(cancelDevContainerLifecycleExecution).toHaveBeenCalledWith(
      project.id,
      ENVIRONMENT,
    );
    wrapper.unmount();
  });

  it('runtime owned saudável aparece Ativo e oferece rebuild + parada', async () => {
    fetchDevContainerLifecyclePreflight.mockResolvedValueOnce(
      runtimePreflight(),
    );

    const wrapper = mount(ProjectDevContainerPanel, {
      props: { project, environmentInstanceId: ENVIRONMENT },
    });
    await flushPromises();

    expect(wrapper.text()).toContain('Ativo');
    expect(wrapper.text()).toContain('Dev Container');
    expect(wrapper.text()).toContain('Ready');
    expect(
      wrapper
        .findAll('button')
        .some((button) => button.text().trim() === 'Rebuild'),
    ).toBe(true);
    expect(
      wrapper
        .findAll('button')
        .some((button) => button.text().trim() === 'Parar'),
    ).toBe(true);
    expect(wrapper.text()).not.toContain('Revisão necessária');
    wrapper.unmount();
  });

  it('recovery-required limpa somente runtime parcial com confirmação backend', async () => {
    fetchDevContainerLifecyclePreflight.mockResolvedValueOnce(
      hostPreflight({
        state: 'blocked',
        reason: 'recovery-required',
        environmentLifecycle: 'failed',
        recoveryAvailable: true,
        requiresConfirmation: false,
        diagnostic: 'O lifecycle anterior não terminou.',
      }),
    );
    prepareDevContainerStopConfirmation.mockResolvedValueOnce({
      token: 'b'.repeat(64),
      environmentInstanceId: ENVIRONMENT,
      expiresAt: '2026-10-02T10:01:00.000Z',
    });
    startDevContainerLifecycleExecution.mockResolvedValueOnce({
      id: 'execution-recovery',
      projectId: project.id,
      environmentInstanceId: ENVIRONMENT,
      operation: 'recover',
      status: 'queued',
      stage: 'queued',
      cancelSupported: false,
      startedAt: '2026-10-02T10:00:00.000Z',
    });

    const wrapper = mount(ProjectDevContainerPanel, {
      props: { project, environmentInstanceId: ENVIRONMENT },
    });
    await flushPromises();

    expect(wrapper.text()).toContain('Recuperação necessária');
    const recover = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Limpar runtime parcial'));
    expect(recover).toBeDefined();
    await recover!.trigger('click');

    expect(wrapper.text()).toContain('Limpar runtime parcial?');
    await wrapper.get('.devcontainer-confirm-action').trigger('click');
    await flushPromises();

    expect(prepareDevContainerStopConfirmation).toHaveBeenCalledWith(
      project.id,
      ENVIRONMENT,
    );
    expect(startDevContainerLifecycleExecution).toHaveBeenCalledWith(
      project.id,
      'recover',
      'b'.repeat(64),
      ENVIRONMENT,
    );
    wrapper.unmount();
  });

  it('recarrega preflight e execução ao trocar Environment Instance', async () => {
    const worktreeEnvironment =
      'environment:worktree:project-devcontainer:feature';
    fetchDevContainerLifecyclePreflight
      .mockResolvedValueOnce(
        hostPreflight({
          state: 'unavailable',
          reason: 'discovery-not-ready',
          discoveryState: 'not-configured',
          requiresConfirmation: false,
          configuration: undefined,
          configSource: undefined,
          diagnostic: 'Configuração ausente.',
        }),
      )
      .mockResolvedValueOnce(
        hostPreflight({
          environmentInstanceId: worktreeEnvironment,
          configuration: {
            kind: 'dockerfile',
            lifecycleHooks: [],
          },
        }),
      );

    const wrapper = mount(ProjectDevContainerPanel, {
      props: { project, environmentInstanceId: ENVIRONMENT },
    });
    await flushPromises();

    await wrapper.setProps({ environmentInstanceId: worktreeEnvironment });
    await flushPromises();

    expect(fetchDevContainerLifecyclePreflight).toHaveBeenLastCalledWith(
      project.id,
      worktreeEnvironment,
    );
    expect(fetchDevContainerLifecycleExecution).toHaveBeenLastCalledWith(
      project.id,
      worktreeEnvironment,
    );
    wrapper.unmount();
  });
});
