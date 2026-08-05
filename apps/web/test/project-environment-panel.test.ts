import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

import type { Project, ProjectEnvironmentOverview } from '@dev-dashboard/contracts';

const { fetchProjectEnvironmentVariables } = vi.hoisted(() => ({
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
}));

vi.mock('../src/api', () => ({ fetchProjectEnvironmentVariables }));

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
  it('mostra o valor de variáveis normais e oculta o de variáveis sensíveis', async () => {
    const wrapper = mount(ProjectEnvironmentPanel, { props: { project } });

    await flushPromises();

    expect(wrapper.text()).toContain('.env');
    expect(wrapper.text()).toContain('API_URL');
    expect(wrapper.text()).toContain('https://example.com');
    expect(wrapper.text()).toContain('API_SECRET_TOKEN');
    expect(wrapper.text()).toContain('Oculto (segredo)');
    expect(wrapper.html()).not.toContain('super-secreto');
  });

  it('mostra estado vazio quando nenhum arquivo .env é reconhecido', async () => {
    fetchProjectEnvironmentVariables.mockResolvedValueOnce({ files: [] });
    const wrapper = mount(ProjectEnvironmentPanel, { props: { project } });

    await flushPromises();

    expect(wrapper.text()).toContain('Nenhum arquivo');
  });
});
