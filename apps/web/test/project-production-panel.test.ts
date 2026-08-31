import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

import type {
  Deployment,
  DeploymentPlan,
  Project,
} from '@dev-dashboard/contracts';

const api = vi.hoisted(() => ({
  cancelDeployment: vi.fn(),
  createDeploymentConfirmation: vi.fn(),
  fetchDeployment: vi.fn(),
  fetchDeploymentHistory: vi.fn(),
  fetchDeploymentLog: vi.fn(),
  fetchDeploymentPlan: vi.fn(),
  fetchProductionDeploymentStatus: vi.fn(),
  fetchProjectGitWorkspace: vi.fn(),
  startDeployment: vi.fn(),
}));

vi.mock('../src/api', () => api);

import ProjectProductionPanel from '../src/components/ProjectProductionPanel.vue';

const REVISION_A = 'a'.repeat(40);
const REVISION_B = 'b'.repeat(40);
const PLAN_HASH = 'c'.repeat(64);

function commandProject(id = 'project-1'): Project {
  return {
    id,
    name: id === 'project-1' ? 'Projeto A' : 'Projeto B',
    path: `/tmp/${id}`,
    type: 'node',
    source: 'standalone',
    enabled: true,
    capabilities: ['git', 'production'],
    production: {
      version: 1,
      enabled: true,
      strategy: 'command',
      provider: 'systemd',
      branch: 'main',
      commands: {
        status: 'prod:status',
        check: 'prod:check',
        deploy: 'prod:deploy',
        verify: 'prod:verify',
      },
      health: { type: 'http', url: 'https://example.test/health' },
      policies: {
        backup: 'not-configured',
        migrations: 'not-configured',
        rollback: 'manual-restore',
      },
    },
  };
}

function successfulDeployment(
  projectId = 'project-1',
  revision = REVISION_A,
): Deployment {
  return {
    id: `deployment-${projectId}`,
    projectId,
    projectName: projectId === 'project-1' ? 'Projeto A' : 'Projeto B',
    provider: 'systemd',
    branch: 'main',
    revision,
    planHash: PLAN_HASH,
    status: 'succeeded',
    createdAt: '2026-08-31T12:00:00.000Z',
    startedAt: '2026-08-31T12:00:01.000Z',
    finishedAt: '2026-08-31T12:00:03.000Z',
    timeline: [
      {
        id: 'check',
        script: 'prod:check',
        phase: 'preparing',
        mutating: false,
        irreversible: false,
        status: 'succeeded',
      },
      {
        id: 'deploy',
        script: 'prod:deploy',
        phase: 'deploying',
        mutating: true,
        irreversible: false,
        status: 'succeeded',
      },
      {
        id: 'verify',
        script: 'prod:verify',
        phase: 'verifying',
        mutating: false,
        irreversible: false,
        status: 'succeeded',
      },
    ],
  };
}

function privilegeFailedDeployment(): Deployment {
  return {
    id: 'deployment-privilege-failed',
    projectId: 'project-1',
    projectName: 'Projeto A',
    provider: 'systemd',
    branch: 'main',
    revision: REVISION_A,
    planHash: PLAN_HASH,
    status: 'failed',
    createdAt: '2026-08-31T12:00:00.000Z',
    startedAt: '2026-08-31T12:00:01.000Z',
    finishedAt: '2026-08-31T12:00:03.000Z',
    failurePoint: 'before-irreversible',
    errorCode: 'DEPLOYMENT_PRIVILEGE_REQUIRED',
    errorMessage:
      'O comando de produção requer sudo interativo. Configure privilégio não interativo limitado.',
    timeline: [
      {
        id: 'check',
        script: 'prod:check',
        phase: 'preparing',
        mutating: false,
        irreversible: false,
        status: 'succeeded',
      },
      {
        id: 'deploy',
        script: 'prod:deploy',
        phase: 'deploying',
        mutating: true,
        irreversible: false,
        status: 'failed',
      },
      {
        id: 'verify',
        script: 'prod:verify',
        phase: 'verifying',
        mutating: false,
        irreversible: false,
        status: 'pending',
      },
    ],
  };
}

function deploymentPlan(): DeploymentPlan {
  return {
    projectId: 'project-1',
    projectName: 'Projeto A',
    provider: 'systemd',
    branch: 'main',
    revision: REVISION_A,
    planHash: PLAN_HASH,
    createdAt: '2026-08-31T12:00:00.000Z',
    steps: [
      {
        id: 'check',
        script: 'prod:check',
        phase: 'preparing',
        mutating: false,
        irreversible: false,
      },
      {
        id: 'deploy',
        script: 'prod:deploy',
        phase: 'deploying',
        mutating: true,
        irreversible: false,
      },
      {
        id: 'verify',
        script: 'prod:verify',
        phase: 'verifying',
        mutating: false,
        irreversible: false,
      },
    ],
  };
}

function resetApi(): void {
  for (const mock of Object.values(api)) mock.mockReset();
  api.fetchDeploymentHistory.mockResolvedValue({
    items: [],
    page: 1,
    pageSize: 8,
    total: 0,
  });
  api.fetchProjectGitWorkspace.mockResolvedValue({
    branches: [],
    remotes: [],
  });
  api.fetchDeploymentLog.mockResolvedValue({
    deploymentId: 'deployment-project-1',
    content: 'deploy ok',
    truncated: false,
    masked: true,
    redactionCount: 1,
  });
}

describe('ProjectProductionPanel', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('não oferece ação quando o projeto não possui capability de produção', async () => {
    resetApi();
    const project = commandProject();
    project.capabilities = ['git'];
    delete project.production;
    const wrapper = mount(ProjectProductionPanel, { props: { project } });
    await flushPromises();

    expect(wrapper.text()).toContain('Produção não configurada');
    expect(wrapper.find('button').exists()).toBe(false);
    expect(api.fetchDeploymentHistory).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('mostra warning de contrato inválido sem liberar botão de produção', async () => {
    resetApi();
    const project = commandProject();
    project.capabilities = ['git'];
    delete project.production;
    project.productionWarning = {
      code: 'PRODUCTION_CONTRACT_INVALID_SHAPE',
      message: 'O contrato precisa ser corrigido.',
      manifestPath: '.dev-dashboard/production.json',
    };
    const wrapper = mount(ProjectProductionPanel, { props: { project } });
    await flushPromises();

    expect(wrapper.text()).toContain('Contrato de produção inválido');
    expect(wrapper.text()).toContain('O contrato precisa ser corrigido.');
    expect(wrapper.find('button').exists()).toBe(false);
    wrapper.unmount();
  });

  it('exige preview do plano antes de confirmar e iniciar deployment command', async () => {
    resetApi();
    api.fetchDeploymentPlan.mockResolvedValue(deploymentPlan());
    api.createDeploymentConfirmation.mockResolvedValue({
      token: 'd'.repeat(64),
      projectId: 'project-1',
      revision: REVISION_A,
      planHash: PLAN_HASH,
      expiresAt: '2026-08-31T12:01:00.000Z',
    });
    api.startDeployment.mockResolvedValue(successfulDeployment());

    const wrapper = mount(ProjectProductionPanel, {
      props: {
        project: commandProject(),
        gitOverview: {
          repository: true,
          branch: 'main',
          detached: false,
          ahead: 0,
          behind: 0,
          clean: true,
          files: [],
          latestCommit: {
            hash: REVISION_A,
            shortHash: REVISION_A.slice(0, 8),
            subject: 'feat: alvo',
            authorName: 'Dev',
            authorEmail: 'dev@example.com',
            authoredAt: '2026-08-31T11:00:00.000Z',
          },
          recentCommits: [],
        },
      },
    });
    await flushPromises();

    expect(wrapper.text()).not.toContain('Revise o plano antes de executar');
    await wrapper.get('button').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Revise o plano antes de executar');
    expect(wrapper.text()).toContain('Revision alvo');
    expect(wrapper.text()).toContain('Muda estado');
    expect(api.createDeploymentConfirmation).not.toHaveBeenCalled();

    const confirmButton = wrapper
      .findAll('button')
      .find((button) =>
        button.text().includes('Confirmar e iniciar deployment'),
      );
    expect(confirmButton).toBeDefined();
    await confirmButton!.trigger('click');
    await flushPromises();

    expect(api.createDeploymentConfirmation).toHaveBeenCalledWith(
      'project-1',
      PLAN_HASH,
      expect.any(AbortSignal),
    );
    expect(api.startDeployment).toHaveBeenCalledWith(
      'project-1',
      PLAN_HASH,
      'd'.repeat(64),
      expect.any(AbortSignal),
    );
    expect(wrapper.text()).toContain('Timeline do deployment');
    expect(wrapper.text()).toContain('Último deployment concluído');
    expect(wrapper.text()).toContain('deploy ok');
    wrapper.unmount();
  });

  it('permite gerar novo plano depois de corrigir externamente um bloqueio de sudo', async () => {
    resetApi();
    const failed = privilegeFailedDeployment();
    api.fetchDeploymentHistory.mockResolvedValue({
      items: [failed],
      page: 1,
      pageSize: 8,
      total: 1,
    });
    api.fetchDeploymentLog.mockResolvedValue({
      deploymentId: failed.id,
      content: 'sudo: a terminal is required to authenticate',
      truncated: false,
      masked: false,
      redactionCount: 0,
    });
    api.fetchDeploymentPlan.mockResolvedValue(deploymentPlan());

    const wrapper = mount(ProjectProductionPanel, {
      props: { project: commandProject() },
    });
    await flushPromises();

    const buttons = wrapper.findAll('button');
    const authorizeButton = buttons.find((button) =>
      button.text().includes('Autorizar sudo'),
    );
    const retryButton = buttons.find((button) =>
      button.text().includes('Preparar novamente'),
    );

    expect(authorizeButton).toBeDefined();
    expect(retryButton).toBeDefined();

    await retryButton!.trigger('click');
    await flushPromises();

    expect(api.fetchDeploymentPlan).toHaveBeenCalledWith(
      'project-1',
      expect.any(AbortSignal),
    );
    expect(wrapper.text()).toContain('Revise o plano antes de executar');
    wrapper.unmount();
  });

  it('descarta resposta obsoleta quando o projeto muda', async () => {
    resetApi();
    let resolveFirst!: (value: {
      items: Deployment[];
      page: number;
      pageSize: number;
      total: number;
    }) => void;
    const first = new Promise<{
      items: Deployment[];
      page: number;
      pageSize: number;
      total: number;
    }>((resolve) => {
      resolveFirst = resolve;
    });

    api.fetchDeploymentHistory.mockImplementation((projectId: string) => {
      if (projectId === 'project-1') return first;
      return Promise.resolve({
        items: [successfulDeployment('project-2', REVISION_B)],
        page: 1,
        pageSize: 8,
        total: 1,
      });
    });

    const wrapper = mount(ProjectProductionPanel, {
      props: { project: commandProject('project-1') },
    });
    await wrapper.setProps({ project: commandProject('project-2') });
    await flushPromises();

    resolveFirst({
      items: [successfulDeployment('project-1', REVISION_A)],
      page: 1,
      pageSize: 8,
      total: 1,
    });
    await flushPromises();

    expect(wrapper.text()).toContain(REVISION_B.slice(0, 8));
    expect(wrapper.text()).not.toContain(REVISION_A.slice(0, 8));
    wrapper.unmount();
  });

  it('representa drift Vercel sem oferecer mutação remota', async () => {
    resetApi();
    const project: Project = {
      ...commandProject(),
      production: {
        version: 1,
        enabled: true,
        strategy: 'git-managed',
        provider: 'vercel',
        branch: 'main',
        commands: {
          check: 'prod:check',
          verify: 'prod:verify',
        },
        external: { project: 'controle-gastos' },
        policies: {
          backup: 'external',
          migrations: 'not-configured',
          rollback: 'provider-only-when-schema-compatible',
        },
      },
    };
    api.fetchProductionDeploymentStatus.mockResolvedValue({
      projectId: 'project-1',
      projectName: 'Projeto A',
      strategy: 'git-managed',
      provider: 'vercel',
      branch: 'main',
      externalProject: 'controle-gastos',
      providerAvailability: 'available',
      originRevision: REVISION_A,
      productionRevision: REVISION_B,
      drift: 'drift',
      localOperations: ['check', 'verify'],
      providerProjectId: 'prj_1',
      providerProjectName: 'controle-gastos',
      deployment: {
        id: 'dpl_1',
        url: 'https://example.vercel.app',
        state: 'ready',
        createdAt: '2026-08-31T12:00:00.000Z',
        branch: 'main',
        revision: REVISION_B,
      },
      timeline: [
        {
          id: 'provider-deploy',
          phase: 'deploying',
          status: 'succeeded',
        },
      ],
    });

    const wrapper = mount(ProjectProductionPanel, { props: { project } });
    await flushPromises();

    expect(wrapper.text()).toContain('Produção está em revision diferente');
    expect(wrapper.text()).toContain('Desatualizada');
    expect(wrapper.text()).toContain('prod:check');
    expect(wrapper.text()).not.toContain('Confirmar e iniciar deployment');
    wrapper.unmount();
  });
});
