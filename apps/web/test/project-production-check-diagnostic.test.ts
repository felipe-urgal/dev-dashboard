import { describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

import type { Deployment, Project } from '@dev-dashboard/contracts';

const api = vi.hoisted(() => ({
  cancelDeployment: vi.fn(),
  createDeploymentConfirmation: vi.fn(),
  fetchDeployment: vi.fn(),
  fetchDeploymentHistory: vi.fn(),
  fetchDeploymentLog: vi.fn(),
  fetchDeploymentPlan: vi.fn(),
  fetchProductionDeploymentStatus: vi.fn(),
  fetchProjectGitWorkspace: vi.fn(),
  retryDeploymentVerify: vi.fn(),
  startDeployment: vi.fn(),
}));

vi.mock('../src/api', () => api);

import ProjectProductionPanel from '../src/components/ProjectProductionPanel.vue';

const REVISION = 'a'.repeat(40);
const DIAGNOSTIC =
  'O check não conseguiu acessar o banco configurado para o ambiente de check. Verifique se essa dependência está pronta e tente novamente; o Dev Dashboard não inicia esse serviço automaticamente.';

function project(): Project {
  return {
    id: 'project-1',
    name: 'Projeto A',
    path: '/tmp/project-1',
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
      policies: {
        backup: 'not-configured',
        migrations: 'not-configured',
        rollback: 'manual-restore',
      },
    },
  };
}

function failedDeployment(): Deployment {
  return {
    id: 'deployment-check-database-unavailable',
    projectId: 'project-1',
    projectName: 'Projeto A',
    provider: 'systemd',
    branch: 'main',
    revision: REVISION,
    planHash: 'b'.repeat(64),
    status: 'failed',
    createdAt: '2026-09-03T12:00:00.000Z',
    startedAt: '2026-09-03T12:00:01.000Z',
    finishedAt: '2026-09-03T12:00:02.000Z',
    failurePoint: 'before-irreversible',
    errorCode: 'DEPLOYMENT_CHECK_DATABASE_UNAVAILABLE',
    errorMessage: DIAGNOSTIC,
    timeline: [
      {
        id: 'check',
        script: 'prod:check',
        phase: 'preparing',
        mutating: false,
        irreversible: false,
        status: 'failed',
      },
      {
        id: 'deploy',
        script: 'prod:deploy',
        phase: 'deploying',
        mutating: true,
        irreversible: false,
        status: 'pending',
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

describe('ProjectProductionPanel check database diagnostic', () => {
  it('mostra o diagnóstico sanitizado no estado principal da produção', async () => {
    const failed = failedDeployment();
    api.fetchDeploymentHistory.mockResolvedValue({
      items: [failed],
      page: 1,
      pageSize: 8,
      total: 1,
    });
    api.fetchProjectGitWorkspace.mockResolvedValue({
      branches: [],
      remotes: [],
    });
    api.fetchDeploymentLog.mockResolvedValue({
      deploymentId: failed.id,
      content: `[Dev Dashboard] ${DIAGNOSTIC}`,
      truncated: false,
      masked: false,
      redactionCount: 0,
    });

    const wrapper = mount(ProjectProductionPanel, {
      props: { project: project() },
    });
    await flushPromises();

    expect(wrapper.text()).toContain('Banco de check indisponível');
    expect(wrapper.text()).toContain(DIAGNOSTIC);
    expect(wrapper.text()).not.toContain(
      'A falha ocorreu antes de uma mudança irreversível.',
    );

    wrapper.unmount();
  });
});
