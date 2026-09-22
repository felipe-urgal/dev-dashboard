import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

import type {
  Deployment,
  DeploymentPlan,
  Project,
} from '@dev-dashboard/contracts';

const api = vi.hoisted(() => ({
  createDeploymentConfirmation: vi.fn(),
  fetchDeployment: vi.fn(),
  fetchDeploymentHistory: vi.fn(),
  fetchDeploymentLog: vi.fn(),
  fetchDeploymentPlan: vi.fn(),
  startDeployment: vi.fn(),
}));

vi.mock('../src/api', () => api);

import ProjectSelfUpdateProductionPanel from '../src/components/ProjectSelfUpdateProductionPanel.vue';

const CURRENT_REVISION = 'a'.repeat(40);
const NEXT_REVISION = 'b'.repeat(40);
const PLAN_HASH = 'c'.repeat(64);

function project(): Project {
  return {
    id: 'dev-dashboard',
    name: 'Dev Dashboard',
    path: '/tmp/dev-dashboard',
    type: 'node',
    source: 'standalone',
    enabled: true,
    capabilities: ['git', 'production'],
    production: {
      version: 1,
      enabled: true,
      strategy: 'self-update',
      provider: 'none',
      branch: 'main',
      commands: {
        check: 'prod:check',
      },
      policies: {
        backup: 'not-configured',
        migrations: 'not-configured',
        rollback: 'not-configured',
      },
    },
  };
}

function successfulDeployment(): Deployment {
  return {
    id: 'self-update-1',
    projectId: 'dev-dashboard',
    projectName: 'Dev Dashboard',
    provider: 'none',
    branch: 'main',
    revision: CURRENT_REVISION,
    planHash: PLAN_HASH,
    status: 'succeeded',
    createdAt: '2026-09-22T12:00:00.000Z',
    startedAt: '2026-09-22T12:00:01.000Z',
    finishedAt: '2026-09-22T12:00:19.000Z',
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
        id: 'self-update',
        phase: 'deploying',
        mutating: true,
        irreversible: true,
        status: 'succeeded',
      },
    ],
  };
}

function plan(): DeploymentPlan {
  return {
    projectId: 'dev-dashboard',
    projectName: 'Dev Dashboard',
    provider: 'none',
    branch: 'main',
    revision: NEXT_REVISION,
    planHash: PLAN_HASH,
    createdAt: '2026-09-22T12:30:00.000Z',
    steps: [
      {
        id: 'check',
        script: 'prod:check',
        phase: 'preparing',
        mutating: false,
        irreversible: false,
      },
      {
        id: 'self-update',
        phase: 'deploying',
        mutating: true,
        irreversible: true,
      },
    ],
  };
}

function resetApi(): void {
  for (const mock of Object.values(api)) mock.mockReset();
  const latest = successfulDeployment();
  api.fetchDeploymentHistory.mockResolvedValue({
    items: [latest],
    page: 1,
    pageSize: 8,
    total: 1,
  });
  api.fetchDeploymentLog.mockResolvedValue({
    deploymentId: latest.id,
    content: 'self-update ok',
    truncated: false,
    masked: false,
    redactionCount: 0,
  });
}

describe('ProjectSelfUpdateProductionPanel', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('mantém o resumo compacto e confirma o self-update pelo modal', async () => {
    resetApi();
    api.fetchDeploymentPlan.mockResolvedValue(plan());
    api.createDeploymentConfirmation.mockResolvedValue({
      token: 'd'.repeat(64),
      projectId: 'dev-dashboard',
      revision: NEXT_REVISION,
      planHash: PLAN_HASH,
      expiresAt: '2026-09-22T12:31:00.000Z',
    });
    api.startDeployment.mockResolvedValue(successfulDeployment());

    const wrapper = mount(ProjectSelfUpdateProductionPanel, {
      props: { project: project() },
    });
    await flushPromises();

    expect(wrapper.text()).toContain('Self-update disponível');
    expect(wrapper.text()).toContain('Últimas atualizações');
    expect(wrapper.text()).toContain('Detalhes técnicos');
    expect(wrapper.text()).not.toContain('Log da última execução');

    const details = wrapper.get('details');
    expect(details.attributes('open')).toBeUndefined();

    const prepareButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Preparar atualização'));
    expect(prepareButton).toBeDefined();
    await prepareButton!.trigger('click');
    await flushPromises();

    expect(document.body.textContent).toContain('Atualização pronta');
    expect(document.body.textContent).toContain(
      NEXT_REVISION.slice(0, 10),
    );
    expect(api.createDeploymentConfirmation).not.toHaveBeenCalled();

    const applyButton = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>('button'),
    ).find((button) => button.textContent?.includes('Aplicar atualização'));
    expect(applyButton).toBeDefined();
    applyButton!.click();
    await flushPromises();

    expect(api.createDeploymentConfirmation).toHaveBeenCalledWith(
      'dev-dashboard',
      PLAN_HASH,
      expect.any(AbortSignal),
    );
    expect(api.startDeployment).toHaveBeenCalledWith(
      'dev-dashboard',
      PLAN_HASH,
      'd'.repeat(64),
      expect.any(AbortSignal),
    );

    wrapper.unmount();
  });
});
