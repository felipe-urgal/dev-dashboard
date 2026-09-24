import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Project } from '@dev-dashboard/contracts';

const { fetchDevContainerInspection, fetchDevContainerLifecyclePreflight } =
  vi.hoisted(() => ({
    fetchDevContainerInspection: vi.fn(),
    fetchDevContainerLifecyclePreflight: vi.fn(),
  }));

vi.mock('../src/api/dev-container', () => ({
  fetchDevContainerInspection: (...args: unknown[]) =>
    fetchDevContainerInspection(...args),
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

function preflight(overrides: Record<string, unknown> = {}) {
  return {
    projectId: project.id,
    operation: 'create',
    state: 'review',
    reason: 'review-required',
    observedAt: '2026-09-24T22:20:00.000Z',
    environmentInstanceId: 'environment:primary:project-devcontainer',
    runtime: 'host',
    executionEnabled: false,
    requiresConfirmation: true,
    configSource: '.devcontainer/devcontainer.json',
    cliVersion: '0.80.1',
    configuration: {
      kind: 'image',
      lifecycleHooks: [],
    },
    limitations: ['cleanup-adapter-pending'],
    diagnostic:
      'A configuração pode avançar para revisão humana, mas a execução permanece desabilitada.',
    ...overrides,
  };
}

describe('ProjectDevContainerPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchDevContainerLifecyclePreflight.mockResolvedValue(preflight());
  });

  it('mostra configuração sanitizada e preflight sem oferecer lifecycle mutável', async () => {
    fetchDevContainerInspection.mockResolvedValueOnce({
      state: 'available',
      observedAt: '2026-09-24T21:20:00.000Z',
      configSource: '.devcontainer/devcontainer.json',
      cliVersion: '0.80.1',
      configuration: {
        kind: 'compose',
        name: 'Workspace',
        service: 'api',
        lifecycleHooks: ['postCreateCommand', 'postStartCommand'],
      },
    });
    fetchDevContainerLifecyclePreflight.mockResolvedValueOnce(
      preflight({
        state: 'blocked',
        reason: 'compose-ownership-required',
        requiresConfirmation: false,
        configuration: {
          kind: 'compose',
          lifecycleHooks: ['postCreateCommand', 'postStartCommand'],
        },
        limitations: ['cleanup-adapter-pending'],
        diagnostic:
          'Dev Containers baseados em Compose permanecem bloqueados até compartilhar ownership com o domínio Docker Compose.',
      }),
    );

    const wrapper = mount(ProjectDevContainerPanel, { props: { project } });
    await flushPromises();

    expect(fetchDevContainerInspection).toHaveBeenCalledWith(project.id);
    expect(fetchDevContainerLifecyclePreflight).toHaveBeenCalledWith(
      project.id,
      undefined,
    );
    expect(wrapper.text()).toContain('Dev Container');
    expect(wrapper.text()).toContain('Disponível');
    expect(wrapper.text()).toContain('Runtime atual');
    expect(wrapper.text()).toContain('Host');
    expect(wrapper.text()).toContain('Docker Compose');
    expect(wrapper.text()).toContain('0.80.1');
    expect(wrapper.text()).toContain('Serviço Compose');
    expect(wrapper.text()).toContain('postCreateCommand · postStartCommand');
    expect(wrapper.text()).toContain('Criação do runtime');
    expect(wrapper.text()).toContain('Bloqueado');
    expect(wrapper.text()).toContain('Cleanup seguro ainda não disponível');
    expect(wrapper.text()).toContain('Execução desabilitada neste estágio');
    expect(wrapper.text()).not.toContain('Iniciar');
    expect(wrapper.text()).not.toContain('Rebuild');
    expect(wrapper.text()).not.toContain('Executar');
    wrapper.unmount();
  });

  it('mantém CLI ausente como estado explícito e read-only', async () => {
    fetchDevContainerInspection.mockResolvedValueOnce({
      state: 'cli-missing',
      observedAt: '2026-09-24T21:21:00.000Z',
      configSource: '.devcontainer.json',
      diagnostic: 'A Dev Container CLI não está disponível no PATH da API.',
    });
    fetchDevContainerLifecyclePreflight.mockResolvedValueOnce(
      preflight({
        state: 'unavailable',
        reason: 'discovery-not-ready',
        requiresConfirmation: false,
        configSource: '.devcontainer.json',
        cliVersion: undefined,
        configuration: undefined,
        diagnostic: 'A Dev Container CLI não está disponível no PATH da API.',
      }),
    );

    const wrapper = mount(ProjectDevContainerPanel, { props: { project } });
    await flushPromises();

    expect(wrapper.text()).toContain('CLI ausente');
    expect(wrapper.text()).toContain('Indisponível');
    expect(wrapper.text()).toContain(
      'A Dev Container CLI não está disponível no PATH da API.',
    );
    expect(wrapper.text()).toContain('.devcontainer.json');
    wrapper.unmount();
  });

  it('usa a Environment Instance selecionada e mostra runtime real do preflight', async () => {
    fetchDevContainerInspection.mockResolvedValueOnce({
      state: 'available',
      observedAt: '2026-09-24T21:22:00.000Z',
      cliVersion: '0.80.1',
      configuration: {
        kind: 'image',
        lifecycleHooks: [],
      },
    });
    fetchDevContainerLifecyclePreflight.mockResolvedValueOnce(
      preflight({
        environmentInstanceId: 'environment:worktree:project-devcontainer:x',
        runtime: 'devcontainer',
        state: 'blocked',
        reason: 'runtime-not-host',
        requiresConfirmation: false,
        diagnostic:
          'A criação inicial de Dev Container só pode ser planejada a partir de uma Environment Instance host.',
      }),
    );

    const wrapper = mount(ProjectDevContainerPanel, {
      props: {
        project,
        environmentInstanceId: 'environment:worktree:project-devcontainer:x',
      },
    });
    await flushPromises();

    expect(fetchDevContainerLifecyclePreflight).toHaveBeenCalledWith(
      project.id,
      'environment:worktree:project-devcontainer:x',
    );
    expect(wrapper.text()).toContain('Runtime atual');
    expect(wrapper.text()).toContain('Dev Container');
    expect(wrapper.text()).toContain('Bloqueado');
    wrapper.unmount();
  });

  it('recarrega ao trocar de projeto ou Environment Instance', async () => {
    fetchDevContainerInspection
      .mockResolvedValueOnce({
        state: 'not-configured',
        observedAt: '2026-09-24T21:22:00.000Z',
      })
      .mockResolvedValueOnce({
        state: 'available',
        observedAt: '2026-09-24T21:23:00.000Z',
        cliVersion: '0.80.1',
        configuration: {
          kind: 'image',
          lifecycleHooks: [],
        },
      })
      .mockResolvedValueOnce({
        state: 'available',
        observedAt: '2026-09-24T21:24:00.000Z',
        cliVersion: '0.80.1',
        configuration: {
          kind: 'image',
          lifecycleHooks: [],
        },
      });

    const wrapper = mount(ProjectDevContainerPanel, { props: { project } });
    await flushPromises();
    expect(wrapper.text()).toContain('Não configurado');

    await wrapper.setProps({
      project: { ...project, id: 'project-devcontainer-2' },
    });
    await flushPromises();

    expect(fetchDevContainerInspection).toHaveBeenLastCalledWith(
      'project-devcontainer-2',
    );

    await wrapper.setProps({
      environmentInstanceId: 'environment:worktree:project-devcontainer-2:x',
    });
    await flushPromises();

    expect(fetchDevContainerLifecyclePreflight).toHaveBeenLastCalledWith(
      'project-devcontainer-2',
      'environment:worktree:project-devcontainer-2:x',
    );
    wrapper.unmount();
  });
});
