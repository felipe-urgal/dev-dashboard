import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Project } from '@dev-dashboard/contracts';

const fetchDevContainerLifecyclePreflight = vi.hoisted(() => vi.fn());
const prepareDevContainerLifecycleConfirmation = vi.hoisted(() => vi.fn());
const startDevContainer = vi.hoisted(() => vi.fn());
const rebuildDevContainer = vi.hoisted(() => vi.fn());
const prepareDevContainerStopConfirmation = vi.hoisted(() => vi.fn());
const stopDevContainer = vi.hoisted(() => vi.fn());

vi.mock('../src/api/dev-container', () => ({
  fetchDevContainerLifecyclePreflight: (...args: unknown[]) =>
    fetchDevContainerLifecyclePreflight(...args),
  prepareDevContainerLifecycleConfirmation: (...args: unknown[]) =>
    prepareDevContainerLifecycleConfirmation(...args),
  startDevContainer: (...args: unknown[]) => startDevContainer(...args),
  rebuildDevContainer: (...args: unknown[]) => rebuildDevContainer(...args),
  prepareDevContainerStopConfirmation: (...args: unknown[]) =>
    prepareDevContainerStopConfirmation(...args),
  stopDevContainer: (...args: unknown[]) => stopDevContainer(...args),
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

describe('ProjectDevContainerPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mostra review sanitizado e oferece somente criação explícita', async () => {
    fetchDevContainerLifecyclePreflight.mockResolvedValueOnce({
      projectId: project.id,
      operation: 'create',
      state: 'review',
      reason: 'review-required',
      observedAt: '2026-09-24T22:20:00.000Z',
      environmentInstanceId: 'environment:primary:project-devcontainer',
      runtime: 'host',
      executionEnabled: false,
      requiresConfirmation: true,
      discoveryState: 'available',
      configSource: '.devcontainer/devcontainer.json',
      cliVersion: '0.80.1',
      configuration: {
        kind: 'image',
        name: 'Workspace',
        lifecycleHooks: ['postCreateCommand', 'postStartCommand'],
      },
      limitations: ['post-create-hooks-deferred'],
      diagnostic: 'A configuração pode avançar para revisão humana.',
    });

    const wrapper = mount(ProjectDevContainerPanel, {
      props: {
        project,
        environmentInstanceId: 'environment:primary:project-devcontainer',
      },
    });
    await flushPromises();

    expect(fetchDevContainerLifecyclePreflight).toHaveBeenCalledWith(
      project.id,
      'environment:primary:project-devcontainer',
    );
    expect(wrapper.text()).toContain('Revisão necessária');
    expect(wrapper.text()).toContain('Runtime');
    expect(wrapper.text()).toContain('Host');
    expect(wrapper.text()).toContain('Imagem');
    expect(wrapper.text()).toContain('0.80.1');
    expect(wrapper.text()).toContain('Workspace');
    expect(wrapper.text()).toContain('postCreateCommand · postStartCommand');
    expect(wrapper.text()).toContain('Preflight somente leitura');
    expect(wrapper.text()).toContain('Criar');
    expect(wrapper.text()).not.toContain('Rebuild');
    expect(wrapper.text()).not.toContain('Stop');
    expect(wrapper.text()).not.toContain('Terminal');
    wrapper.unmount();
  });

  it('expõe blocker de initializeCommand sem botão para contorná-lo', async () => {
    fetchDevContainerLifecyclePreflight.mockResolvedValueOnce({
      projectId: project.id,
      operation: 'create',
      state: 'blocked',
      reason: 'initialize-command-declared',
      observedAt: '2026-09-24T22:21:00.000Z',
      environmentInstanceId: 'environment:primary:project-devcontainer',
      runtime: 'host',
      executionEnabled: false,
      requiresConfirmation: false,
      discoveryState: 'available',
      configSource: '.devcontainer.json',
      cliVersion: '0.80.1',
      configuration: {
        kind: 'dockerfile',
        lifecycleHooks: ['initializeCommand'],
      },
      limitations: [],
      diagnostic:
        'A configuração declara initializeCommand, que pode executar no host.',
    });

    const wrapper = mount(ProjectDevContainerPanel, { props: { project } });
    await flushPromises();

    expect(wrapper.text()).toContain('Bloqueado');
    expect(wrapper.text()).toContain('initializeCommand');
    expect(wrapper.text()).toContain('Preflight somente leitura');
    expect(
      wrapper
        .findAll('button')
        .some((button) => button.text().trim() === 'Criar'),
    ).toBe(false);
    expect(wrapper.findAll('button')).toHaveLength(1);
    expect(wrapper.get('button').attributes('aria-label')).toBe(
      'Atualizar preflight',
    );
    wrapper.unmount();
  });

  it('confirma e cria usando a Environment Instance do preflight antes de recarregar', async () => {
    const environmentInstanceId = 'environment:primary:project-devcontainer';
    fetchDevContainerLifecyclePreflight
      .mockResolvedValueOnce({
        projectId: project.id,
        operation: 'create',
        state: 'review',
        reason: 'review-required',
        observedAt: '2026-09-25T10:10:00.000Z',
        environmentInstanceId,
        runtime: 'host',
        executionEnabled: false,
        requiresConfirmation: true,
        discoveryState: 'available',
        configSource: '.devcontainer/devcontainer.json',
        cliVersion: '0.80.1',
        configuration: {
          kind: 'image',
          lifecycleHooks: ['postCreateCommand'],
        },
        limitations: ['post-create-hooks-deferred'],
        diagnostic: 'Revisão humana necessária.',
      })
      .mockResolvedValueOnce({
        projectId: project.id,
        operation: 'rebuild',
        state: 'review',
        reason: 'review-required',
        observedAt: '2026-09-25T10:11:00.000Z',
        environmentInstanceId,
        runtime: 'devcontainer',
        executionEnabled: false,
        requiresConfirmation: true,
        discoveryState: 'available',
        configSource: '.devcontainer/devcontainer.json',
        cliVersion: '0.80.1',
        configuration: {
          kind: 'image',
          lifecycleHooks: ['postCreateCommand'],
        },
        limitations: ['post-create-hooks-deferred'],
        diagnostic:
          'O Dev Container owned pode avançar para revisão de rebuild.',
      });
    prepareDevContainerLifecycleConfirmation.mockResolvedValueOnce({
      token: 'a'.repeat(64),
      environmentInstanceId,
      operation: 'create',
      expiresAt: '2026-09-25T10:11:00.000Z',
    });
    startDevContainer.mockResolvedValueOnce({
      environmentInstanceId,
      runtime: 'devcontainer',
      containerId: 'b'.repeat(64),
    });

    const wrapper = mount(ProjectDevContainerPanel, {
      props: { project, environmentInstanceId },
    });
    await flushPromises();

    const createButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Criar'));
    expect(createButton).toBeDefined();
    await createButton!.trigger('click');

    expect(prepareDevContainerLifecycleConfirmation).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Criar este Dev Container?');
    expect(wrapper.text()).toContain('Confirmar criação');
    expect(wrapper.text()).toContain(
      'Hooks pós-criação continuarão diferidos.',
    );

    const confirmButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Confirmar criação'));
    expect(confirmButton).toBeDefined();
    await confirmButton!.trigger('click');
    await flushPromises();

    expect(prepareDevContainerLifecycleConfirmation).toHaveBeenCalledWith(
      project.id,
      environmentInstanceId,
    );
    expect(startDevContainer).toHaveBeenCalledWith(
      project.id,
      'a'.repeat(64),
      environmentInstanceId,
    );
    expect(fetchDevContainerLifecyclePreflight).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain('Runtime');
    expect(wrapper.text()).toContain('Dev Container');
    expect(wrapper.text()).toContain('Revisão necessária');
    expect(wrapper.text()).toContain(
      'O rebuild exige confirmação explícita e nova revalidação no backend.',
    );
    expect(
      wrapper
        .findAll('button')
        .some((button) => button.text().trim() === 'Criar'),
    ).toBe(false);
    expect(wrapper.text()).not.toContain('Confirmar criação');
    wrapper.unmount();
  });

  it('mantém discovery indisponível explícito dentro do preflight', async () => {
    fetchDevContainerLifecyclePreflight.mockResolvedValueOnce({
      projectId: project.id,
      operation: 'create',
      state: 'unavailable',
      reason: 'discovery-not-ready',
      observedAt: '2026-09-24T22:22:00.000Z',
      environmentInstanceId: 'environment:primary:project-devcontainer',
      runtime: 'host',
      executionEnabled: false,
      requiresConfirmation: false,
      discoveryState: 'cli-missing',
      configSource: '.devcontainer.json',
      limitations: [],
      diagnostic: 'A Dev Container CLI não está disponível no PATH da API.',
    });

    const wrapper = mount(ProjectDevContainerPanel, { props: { project } });
    await flushPromises();

    expect(wrapper.text()).toContain('CLI ausente');
    expect(wrapper.text()).toContain(
      'A Dev Container CLI não está disponível no PATH da API.',
    );
    expect(wrapper.text()).toContain('.devcontainer.json');
    wrapper.unmount();
  });

  it('confirma e executa rebuild somente para o runtime owned selecionado', async () => {
    const environmentInstanceId =
      'environment:worktree:project-devcontainer:runtime';
    const rebuildPreflight = {
      projectId: project.id,
      operation: 'rebuild' as const,
      state: 'review' as const,
      reason: 'review-required' as const,
      observedAt: '2026-09-25T12:30:00.000Z',
      environmentInstanceId,
      runtime: 'devcontainer' as const,
      executionEnabled: false as const,
      requiresConfirmation: true,
      discoveryState: 'available' as const,
      configSource: '.devcontainer/devcontainer.json' as const,
      cliVersion: '0.80.1',
      configuration: {
        kind: 'image' as const,
        lifecycleHooks: [],
      },
      limitations: [],
      diagnostic: 'O Dev Container owned pode avançar para revisão de rebuild.',
    };
    fetchDevContainerLifecyclePreflight
      .mockResolvedValueOnce(rebuildPreflight)
      .mockResolvedValueOnce({
        ...rebuildPreflight,
        observedAt: '2026-09-25T12:31:00.000Z',
      });
    prepareDevContainerLifecycleConfirmation.mockResolvedValueOnce({
      token: 'c'.repeat(64),
      environmentInstanceId,
      operation: 'rebuild',
      expiresAt: '2026-09-25T12:31:00.000Z',
    });
    rebuildDevContainer.mockResolvedValueOnce({
      environmentInstanceId,
      runtime: 'devcontainer',
      containerId: 'd'.repeat(64),
    });

    const wrapper = mount(ProjectDevContainerPanel, {
      props: { project, environmentInstanceId },
    });
    await flushPromises();

    expect(wrapper.text()).toContain('Runtime');
    expect(wrapper.text()).toContain('Dev Container');
    expect(wrapper.text()).toContain('Revisão necessária');
    expect(wrapper.text()).toContain('rebuild exige confirmação explícita');
    expect(
      wrapper
        .findAll('button')
        .some((button) => button.text().trim() === 'Criar'),
    ).toBe(false);

    const rebuildButton = wrapper
      .findAll('button')
      .find((button) => button.text().trim() === 'Rebuild');
    expect(rebuildButton).toBeDefined();
    await rebuildButton!.trigger('click');

    expect(prepareDevContainerLifecycleConfirmation).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Reconstruir este Dev Container?');
    expect(wrapper.text()).toContain('Confirmar rebuild');
    expect(wrapper.text()).toContain(
      'Volumes não são removidos implicitamente',
    );

    const confirmButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Confirmar rebuild'));
    expect(confirmButton).toBeDefined();
    await confirmButton!.trigger('click');
    await flushPromises();

    expect(prepareDevContainerLifecycleConfirmation).toHaveBeenCalledWith(
      project.id,
      environmentInstanceId,
    );
    expect(rebuildDevContainer).toHaveBeenCalledWith(
      project.id,
      'c'.repeat(64),
      environmentInstanceId,
    );
    expect(startDevContainer).not.toHaveBeenCalled();
    expect(fetchDevContainerLifecyclePreflight).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain('Rebuild');
    expect(wrapper.text()).not.toContain('Confirmar rebuild');
    wrapper.unmount();
  });

  it('recarrega ao trocar a Environment Instance', async () => {
    fetchDevContainerLifecyclePreflight
      .mockResolvedValueOnce({
        projectId: project.id,
        operation: 'create',
        state: 'unavailable',
        reason: 'discovery-not-ready',
        observedAt: '2026-09-24T22:23:00.000Z',
        environmentInstanceId: 'environment:primary:project-devcontainer',
        runtime: 'host',
        executionEnabled: false,
        requiresConfirmation: false,
        discoveryState: 'not-configured',
        limitations: [],
        diagnostic: 'Configuração ausente.',
      })
      .mockResolvedValueOnce({
        projectId: project.id,
        operation: 'create',
        state: 'review',
        reason: 'review-required',
        observedAt: '2026-09-24T22:24:00.000Z',
        environmentInstanceId:
          'environment:worktree:project-devcontainer:feature',
        runtime: 'host',
        executionEnabled: false,
        requiresConfirmation: true,
        discoveryState: 'available',
        cliVersion: '0.80.1',
        configuration: {
          kind: 'dockerfile',
          lifecycleHooks: [],
        },
        limitations: [],
        diagnostic: 'Revisão humana necessária.',
      });

    const wrapper = mount(ProjectDevContainerPanel, {
      props: {
        project,
        environmentInstanceId: 'environment:primary:project-devcontainer',
      },
    });
    await flushPromises();
    expect(wrapper.text()).toContain('Não configurado');
    expect(wrapper.find('.dd-card').exists()).toBe(false);
    expect(wrapper.find('.devcontainer-toolbar').exists()).toBe(true);

    await wrapper.setProps({
      environmentInstanceId:
        'environment:worktree:project-devcontainer:feature',
    });
    await flushPromises();

    expect(fetchDevContainerLifecyclePreflight).toHaveBeenLastCalledWith(
      project.id,
      'environment:worktree:project-devcontainer:feature',
    );
    expect(wrapper.text()).toContain('Revisão necessária');
    wrapper.unmount();
  });
});
