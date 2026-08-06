import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

import type {
  Project,
  ProjectEnvironmentOverview,
  ProjectEnvironmentVariableValue,
} from '@dev-dashboard/contracts';

const {
  fetchProjectEnvironmentVariables,
  fetchProjectEnvironmentVariableValue,
} = vi.hoisted(() => ({
  fetchProjectEnvironmentVariables: vi.fn(
    async (): Promise<ProjectEnvironmentOverview> => ({
      files: [
        {
          file: '.env',
          variables: [
            { name: 'API_URL', value: 'https://example.com', sensitive: false },
            { name: 'API_SECRET_TOKEN', sensitive: true },
          ],
        },
      ],
    }),
  ),
  fetchProjectEnvironmentVariableValue: vi.fn(
    async (): Promise<ProjectEnvironmentVariableValue> => ({
      file: '.env',
      name: 'API_SECRET_TOKEN',
      value: 'super-secreto',
      sensitive: true,
    }),
  ),
}));

vi.mock('../src/api', () => ({
  fetchProjectEnvironmentVariables,
  fetchProjectEnvironmentVariableValue,
}));

import ProjectEnvironmentPanel from '../src/components/ProjectEnvironmentPanel.vue';

const project: Project = {
  id: 'p1',
  workspaceId: 'w1',
  name: 'App',
  path: '/projetos/app',
  type: 'node',
  source: 'workspace',
  favorite: false,
  capabilities: ['server'],
};

describe('ProjectEnvironmentPanel', () => {
  it('mostra o valor de variáveis normais e mantém segredos ocultos por padrão', async () => {
    const wrapper = mount(ProjectEnvironmentPanel, { props: { project } });

    await flushPromises();

    expect(wrapper.text()).toContain('.env');
    expect(wrapper.text()).toContain('API_URL');
    expect(wrapper.text()).toContain('https://example.com');
    expect(wrapper.text()).toContain('API_SECRET_TOKEN');
    expect(wrapper.text()).toContain('Oculto (segredo)');
    expect(wrapper.text()).toContain('Exibir');
    expect(wrapper.html()).not.toContain('super-secreto');
  });

  it('carrega o segredo sob demanda e permite ocultá-lo novamente', async () => {
    const wrapper = mount(ProjectEnvironmentPanel, { props: { project } });
    await flushPromises();

    await wrapper
      .get('button[aria-label="Exibir valor de API_SECRET_TOKEN"]')
      .trigger('click');
    await flushPromises();

    expect(fetchProjectEnvironmentVariableValue).toHaveBeenCalledWith(
      'p1',
      '.env',
      'API_SECRET_TOKEN',
    );
    expect(wrapper.text()).toContain('super-secreto');

    await wrapper
      .get('button[aria-label="Ocultar valor de API_SECRET_TOKEN"]')
      .trigger('click');

    expect(wrapper.html()).not.toContain('super-secreto');
    expect(wrapper.text()).toContain('Oculto (segredo)');
  });

  it('mostra estado vazio quando nenhum arquivo .env é reconhecido', async () => {
    fetchProjectEnvironmentVariables.mockResolvedValueOnce({ files: [] });
    const wrapper = mount(ProjectEnvironmentPanel, { props: { project } });

    await flushPromises();

    expect(wrapper.text()).toContain('Nenhum arquivo');
  });
});
