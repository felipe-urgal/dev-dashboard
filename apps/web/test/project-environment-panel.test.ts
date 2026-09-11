import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  Project,
  ProjectEnvironmentContract,
  ProjectEnvironmentOverview,
  ProjectEnvironmentVariableValue,
} from '@dev-dashboard/contracts';

const overview: ProjectEnvironmentOverview = {
  files: [
    {
      file: '.env',
      variables: [
        { name: 'API_URL', value: 'https://example.com', sensitive: false },
        { name: 'API_SECRET_TOKEN', sensitive: true },
        { name: 'LEGACY_FLAG', value: '1', sensitive: false },
      ],
    },
    {
      file: '.env.test',
      variables: [
        {
          name: 'TEST_DATABASE_URL',
          value: 'postgresql://localhost/app_test',
          sensitive: false,
        },
        { name: 'API_SECRET_TOKEN', sensitive: true },
      ],
    },
    {
      file: '.env.example',
      variables: [
        { name: 'API_URL', value: 'http://localhost:3000', sensitive: false },
        { name: 'API_SECRET_TOKEN', sensitive: true },
      ],
    },
  ],
};

const environmentContract: ProjectEnvironmentContract = {
  sections: [
    {
      scope: 'default',
      baselineStatus: 'resolved',
      baseline: '.env.example',
      baselineCandidates: ['.env.example'],
      sourceFiles: ['.env.example', '.env'],
      variables: [
        {
          name: 'LEGACY_FLAG',
          sensitive: false,
          status: 'undocumented',
          baseline: '.env.example',
          sources: ['.env'],
          required: null,
          suggestedAction: 'document',
        },
        {
          name: 'API_URL',
          sensitive: false,
          status: 'present',
          baseline: '.env.example',
          sources: ['.env.example', '.env'],
          required: true,
          suggestedAction: 'none',
        },
      ],
    },
    {
      scope: 'test',
      baselineStatus: 'missing',
      baseline: null,
      baselineCandidates: [],
      sourceFiles: ['.env.test'],
      variables: [
        {
          name: 'TEST_DATABASE_URL',
          sensitive: false,
          status: 'unknown',
          baseline: null,
          sources: ['.env.test'],
          required: null,
          suggestedAction: 'choose-baseline',
        },
      ],
    },
  ],
};

const {
  fetchProjectEnvironmentVariables,
  fetchProjectEnvironmentVariableValue,
  fetchProjectEnvironmentContract,
} = vi.hoisted(() => ({
  fetchProjectEnvironmentVariables: vi.fn(),
  fetchProjectEnvironmentVariableValue: vi.fn(),
  fetchProjectEnvironmentContract: vi.fn(),
}));

vi.mock('../src/api', () => ({
  fetchProjectEnvironmentVariables,
  fetchProjectEnvironmentVariableValue,
  fetchProjectEnvironmentContract,
}));

import ProjectEnvironmentPanel from '../src/components/ProjectEnvironmentPanel.vue';

const project: Project = {
  id: 'p1',
  workspaceId: 'w1',
  name: 'App',
  path: '/projetos/app',
  type: 'node',
  source: 'workspace',
  enabled: true,
  capabilities: ['server'],
};

describe('ProjectEnvironmentPanel', () => {
  beforeEach(() => {
    fetchProjectEnvironmentVariables.mockResolvedValue(overview);
    fetchProjectEnvironmentVariableValue.mockResolvedValue({
      file: '.env',
      name: 'API_SECRET_TOKEN',
      value: 'super-secreto',
      sensitive: true,
    } satisfies ProjectEnvironmentVariableValue);
    fetchProjectEnvironmentContract.mockResolvedValue(environmentContract);
  });

  it('organiza arquivos em um inspector e mostra consistência no contexto selecionado', async () => {
    const wrapper = mount(ProjectEnvironmentPanel, { props: { project } });

    await flushPromises();
    await flushPromises();

    expect(wrapper.text()).toContain('Estado');
    expect(wrapper.text()).toContain('Atenção');
    expect(wrapper.text()).toContain('3 pendências encontradas');
    expect(wrapper.text()).toContain('Arquivo atual');
    expect(wrapper.text()).toContain('Somente leitura');
    expect(wrapper.find('.project-environment-workspace').exists()).toBe(true);

    const fileButtons = wrapper.findAll('.project-environment-file-button');
    expect(fileButtons).toHaveLength(3);
    expect(fileButtons[0]?.attributes('aria-current')).toBe('true');
    expect(wrapper.get('.project-environment-inspector').text()).toContain(
      '.env',
    );
    expect(wrapper.get('.project-environment-inspector').text()).toContain(
      'LEGACY_FLAG',
    );
    expect(wrapper.get('.project-environment-inspector').text()).toContain(
      'Não documentada',
    );
    expect(wrapper.get('.project-environment-inspector').text()).not.toContain(
      'TEST_DATABASE_URL',
    );

    await fileButtons[1]!.trigger('click');

    expect(wrapper.get('.project-environment-current-file').text()).toBe(
      '.env.test',
    );
    expect(wrapper.get('.project-environment-inspector').text()).toContain(
      'TEST_DATABASE_URL',
    );
    expect(wrapper.get('.project-environment-inspector').text()).toContain(
      'Baseline ausente',
    );
    expect(wrapper.get('.project-environment-inspector').text()).not.toContain(
      'LEGACY_FLAG',
    );
  });

  it('mantém segredos ocultos por padrão, revela sob demanda e permite ocultar novamente', async () => {
    const wrapper = mount(ProjectEnvironmentPanel, { props: { project } });
    await flushPromises();
    await flushPromises();

    expect(wrapper.text()).toContain('API_URL');
    expect(wrapper.text()).toContain('https://example.com');
    expect(wrapper.text()).toContain('API_SECRET_TOKEN');
    expect(wrapper.text()).toContain('Segredo');
    expect(wrapper.html()).not.toContain('super-secreto');

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
    expect(wrapper.text()).toContain('Segredo');
  });

  it('mostra estado vazio quando nenhum arquivo .env é reconhecido', async () => {
    fetchProjectEnvironmentVariables.mockResolvedValueOnce({ files: [] });
    const wrapper = mount(ProjectEnvironmentPanel, { props: { project } });

    await flushPromises();
    await flushPromises();

    expect(wrapper.text()).toContain('Nenhum arquivo');
    expect(wrapper.find('.project-environment-workspace').exists()).toBe(false);
  });
});
