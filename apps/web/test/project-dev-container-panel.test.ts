import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Project } from '@dev-dashboard/contracts';

const fetchDevContainerInspection = vi.hoisted(() => vi.fn());

vi.mock('../src/api/dev-container', () => ({
  fetchDevContainerInspection: (...args: unknown[]) =>
    fetchDevContainerInspection(...args),
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

  it('mostra configuração sanitizada sem oferecer lifecycle', async () => {
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

    const wrapper = mount(ProjectDevContainerPanel, { props: { project } });
    await flushPromises();

    expect(fetchDevContainerInspection).toHaveBeenCalledWith(project.id);
    expect(wrapper.text()).toContain('Dev Container');
    expect(wrapper.text()).toContain('Disponível');
    expect(wrapper.text()).toContain('Runtime atual');
    expect(wrapper.text()).toContain('Host');
    expect(wrapper.text()).toContain('Docker Compose');
    expect(wrapper.text()).toContain('0.80.1');
    expect(wrapper.text()).toContain('Serviço Compose');
    expect(wrapper.text()).toContain('postCreateCommand · postStartCommand');
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

    const wrapper = mount(ProjectDevContainerPanel, { props: { project } });
    await flushPromises();

    expect(wrapper.text()).toContain('CLI ausente');
    expect(wrapper.text()).toContain(
      'A Dev Container CLI não está disponível no PATH da API.',
    );
    expect(wrapper.text()).toContain('.devcontainer.json');
    wrapper.unmount();
  });

  it('recarrega ao trocar de projeto', async () => {
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
    expect(wrapper.text()).toContain('Disponível');
    wrapper.unmount();
  });
});
