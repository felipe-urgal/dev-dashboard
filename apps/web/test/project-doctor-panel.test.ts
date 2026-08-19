import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  Project,
  ProjectDiagnosticReport,
} from '@dev-dashboard/contracts';

const { fetchProjectDoctor } = vi.hoisted(() => ({
  fetchProjectDoctor: vi.fn(),
}));

vi.mock('../src/api', () => ({
  fetchProjectDoctor,
}));

import ProjectDoctorPanel from '../src/components/ProjectDoctorPanel.vue';

const project: Project = {
  id: 'p1',
  workspaceId: 'w1',
  name: 'Aplicação Node',
  path: '/projetos/aplicacao-node',
  type: 'node',
  source: 'workspace',
  enabled: true,
  capabilities: ['server'],
};

const report: ProjectDiagnosticReport = {
  projectId: 'p1',
  generatedAt: '2026-08-05T12:00:00.000Z',
  overallStatus: 'attention',
  summary: {
    passed: 2,
    warnings: 1,
    failed: 0,
    skipped: 1,
  },
  checks: [
    {
      id: 'project-directory',
      category: 'project',
      label: 'Diretório do projeto',
      status: 'passed',
      summary: 'O diretório existe e pode ser lido pela API.',
    },
    {
      id: 'environment-variables',
      category: 'configuration',
      label: 'Variáveis de ambiente',
      status: 'warning',
      summary: '1 nome esperado não foi encontrado: PUBLIC_URL.',
      recommendation: 'Adicione apenas o valor necessário ao ambiente local.',
      action: {
        label: 'Abrir variáveis de ambiente',
        target: 'environment',
      },
    },
    {
      id: 'node-package-manager',
      category: 'dependencies',
      label: 'Gerenciador Node',
      status: 'passed',
      summary: 'npm 11.4.2 está disponível.',
    },
    {
      id: 'optional-check',
      category: 'runtime',
      label: 'Verificação opcional',
      status: 'skipped',
      summary: 'Não aplicável.',
    },
  ],
};

const routerLinkStub = {
  props: ['to'],
  template: '<a><slot /></a>',
};

describe('ProjectDoctorPanel', () => {
  beforeEach(() => {
    fetchProjectDoctor.mockReset();
    fetchProjectDoctor.mockResolvedValue(report);
  });

  it('mostra o resumo e as recomendações sem conteúdo sensível', async () => {
    const wrapper = mount(ProjectDoctorPanel, {
      props: { project },
      global: {
        stubs: { RouterLink: routerLinkStub },
      },
    });

    await flushPromises();

    expect(fetchProjectDoctor).toHaveBeenCalledWith('p1', false);
    expect(wrapper.text()).toContain('O projeto precisa de atenção');
    expect(wrapper.text()).toContain('PUBLIC_URL');
    expect(wrapper.text()).toContain('Abrir variáveis de ambiente');
    expect(wrapper.findAll('.project-doctor-check')).toHaveLength(4);
    expect(wrapper.html()).not.toContain('super-secret');
  });

  it('mantém a tela enxuta sem cabeçalho redundante', async () => {
    const wrapper = mount(ProjectDoctorPanel, {
      props: { project },
      global: {
        stubs: { RouterLink: routerLinkStub },
      },
    });

    await flushPromises();

    expect(wrapper.find('.project-doctor-header').exists()).toBe(false);
    expect(fetchProjectDoctor).toHaveBeenCalledWith('p1', false);
  });

  it('descarta o relatório anterior ao trocar de projeto', async () => {
    let resolveSecond: ((value: ProjectDiagnosticReport) => void) | undefined;
    fetchProjectDoctor.mockResolvedValueOnce(report).mockImplementationOnce(
      () =>
        new Promise<ProjectDiagnosticReport>((resolve) => {
          resolveSecond = resolve;
        }),
    );

    const wrapper = mount(ProjectDoctorPanel, {
      props: { project },
      global: {
        stubs: { RouterLink: routerLinkStub },
      },
    });
    await flushPromises();

    await wrapper.setProps({
      project: {
        ...project,
        id: 'p2',
        name: 'Outro projeto',
      },
    });

    expect(wrapper.text()).toContain('Analisando o projeto');

    resolveSecond?.({
      ...report,
      projectId: 'p2',
      overallStatus: 'healthy',
      summary: { passed: 1, warnings: 0, failed: 0, skipped: 0 },
      checks: [report.checks[0]!],
    });
    await flushPromises();

    expect(fetchProjectDoctor).toHaveBeenLastCalledWith('p2', false);
    expect(wrapper.text()).toContain('Projeto pronto para trabalhar');
  });
});
