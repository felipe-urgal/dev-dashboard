import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Project } from '@dev-dashboard/contracts';

const fetchDevContainerLifecyclePreflight = vi.hoisted(() => vi.fn());

vi.mock('../src/api/dev-container', () => ({
  fetchDevContainerLifecyclePreflight: (...args: unknown[]) =>
    fetchDevContainerLifecyclePreflight(...args),
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

  it('mostra review sanitizado sem oferecer lifecycle mutável', async () => {
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
    expect(wrapper.text()).toContain('Runtime atual');
    expect(wrapper.text()).toContain('Host');
    expect(wrapper.text()).toContain('Imagem');
    expect(wrapper.text()).toContain('0.80.1');
    expect(wrapper.text()).toContain('Workspace');
    expect(wrapper.text()).toContain('postCreateCommand · postStartCommand');
    expect(wrapper.text()).toContain('Execução desabilitada');
    expect(wrapper.text()).not.toContain('Iniciar');
    expect(wrapper.text()).not.toContain('Rebuild');
    expect(wrapper.text()).not.toContain('Executar');
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
    expect(wrapper.text()).toContain('Execução desabilitada');
    expect(wrapper.findAll('button')).toHaveLength(1);
    expect(wrapper.get('button').text()).toContain('Atualizar');
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

  it('mostra o runtime real quando a Environment Instance já é devcontainer', async () => {
    fetchDevContainerLifecyclePreflight.mockResolvedValueOnce({
      projectId: project.id,
      operation: 'create',
      state: 'blocked',
      reason: 'runtime-not-host',
      observedAt: '2026-09-24T22:22:30.000Z',
      environmentInstanceId:
        'environment:worktree:project-devcontainer:runtime',
      runtime: 'devcontainer',
      executionEnabled: false,
      requiresConfirmation: false,
      limitations: [],
      diagnostic:
        'A criação inicial de Dev Container só pode ser planejada a partir de uma Environment Instance host.',
    });

    const wrapper = mount(ProjectDevContainerPanel, {
      props: {
        project,
        environmentInstanceId:
          'environment:worktree:project-devcontainer:runtime',
      },
    });
    await flushPromises();

    expect(wrapper.text()).toContain('Runtime atual');
    expect(wrapper.text()).toContain('Dev Container');
    expect(wrapper.text()).toContain('Bloqueado');
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
