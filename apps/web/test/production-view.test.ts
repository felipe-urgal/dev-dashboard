import assert from 'node:assert/strict';
import { beforeEach, test, vi } from 'vitest';
import { nextTick } from 'vue';

import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils';

import type {
  DeploymentConfirmation,
  DeploymentPlan,
  ProductionOverview,
} from '@dev-dashboard/contracts';

vi.mock('../src/api', () => ({
  createDeploymentConfirmation: vi.fn(),
  fetchDeployment: vi.fn(),
  fetchDeploymentPlan: vi.fn(),
  fetchProductionOverview: vi.fn(),
  startDeployment: vi.fn(),
}));

vi.mock('../src/stores/dashboard', async () => {
  const { ref } = await import('vue');
  return {
    dashboardStore: {
      selectedWorkspaceId: ref('workspace-1'),
      scanningWorkspace: ref(false),
      ensureDashboardLoaded: vi.fn(async () => undefined),
    },
  };
});

import {
  createDeploymentConfirmation,
  fetchDeployment,
  fetchDeploymentPlan,
  fetchProductionOverview,
  startDeployment,
} from '../src/api';
import { dashboardStore } from '../src/stores/dashboard';
import ProductionView from '../src/views/ProductionView.vue';

const createConfirmationMock = vi.mocked(createDeploymentConfirmation);
const fetchDeploymentMock = vi.mocked(fetchDeployment);
const fetchPlanMock = vi.mocked(fetchDeploymentPlan);
const fetchOverviewMock = vi.mocked(fetchProductionOverview);
const startDeploymentMock = vi.mocked(startDeployment);

function overview(projectId: string, projectName: string): ProductionOverview {
  return {
    generatedAt: '2026-09-01T15:00:00.000Z',
    items: [
      {
        projectId,
        projectName,
        state: 'in-sync',
        health: 'unknown',
      },
    ],
  };
}

function pendingOverview(): ProductionOverview {
  return {
    generatedAt: '2026-09-02T10:00:00.000Z',
    items: [
      {
        projectId: 'project-a',
        projectName: 'Projeto A',
        state: 'drift',
        health: 'unknown',
        strategy: 'command',
        provider: 'systemd',
        branch: 'main',
        targetRevision: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      },
      {
        projectId: 'project-b',
        projectName: 'Projeto B',
        state: 'drift',
        health: 'unknown',
        strategy: 'git-managed',
        provider: 'vercel',
        branch: 'main',
        targetRevision: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      },
    ],
  };
}

function plan(projectId: string): DeploymentPlan {
  return {
    projectId,
    projectName: projectId === 'project-a' ? 'Projeto A' : 'Projeto B',
    provider: projectId === 'project-a' ? 'systemd' : 'vercel',
    branch: 'main',
    revision:
      projectId === 'project-a'
        ? 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
        : 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    planHash: `plan-${projectId}`,
    createdAt: '2026-09-02T10:00:00.000Z',
    steps: [],
  };
}

function confirmation(projectId: string): DeploymentConfirmation {
  return {
    token: `token-${projectId}`,
    projectId,
    revision: plan(projectId).revision,
    planHash: `plan-${projectId}`,
    expiresAt: '2026-09-02T10:05:00.000Z',
  };
}

beforeEach(() => {
  dashboardStore.selectedWorkspaceId.value = 'workspace-1';
  dashboardStore.scanningWorkspace.value = false;
  fetchOverviewMock.mockReset();
  fetchPlanMock.mockReset();
  createConfirmationMock.mockReset();
  startDeploymentMock.mockReset();
  fetchDeploymentMock.mockReset();

  fetchOverviewMock.mockImplementation(async (workspaceId) =>
    workspaceId === 'workspace-2'
      ? overview('project-2', 'Projeto workspace 2')
      : overview('project-1', 'Projeto workspace 1'),
  );
  fetchPlanMock.mockImplementation(async (projectId) => plan(projectId));
  createConfirmationMock.mockImplementation(async (projectId) =>
    confirmation(projectId),
  );
});

test('recarrega o overview quando o scan da troca de workspace termina', async () => {
  const wrapper = mount(ProductionView, {
    global: { stubs: { RouterLink: RouterLinkStub } },
  });

  await flushPromises();
  assert.match(wrapper.text(), /Projeto workspace 1/);

  dashboardStore.scanningWorkspace.value = true;
  dashboardStore.selectedWorkspaceId.value = 'workspace-2';
  await nextTick();
  await flushPromises();

  assert.equal(
    fetchOverviewMock.mock.calls.filter(
      ([workspaceId]) => workspaceId === 'workspace-2',
    ).length,
    0,
  );
  assert.doesNotMatch(wrapper.text(), /Nenhum projeto foi detectado/);

  dashboardStore.scanningWorkspace.value = false;
  await nextTick();
  await flushPromises();

  assert.equal(
    fetchOverviewMock.mock.calls.filter(
      ([workspaceId]) => workspaceId === 'workspace-2',
    ).length,
    1,
  );
  assert.match(wrapper.text(), /Projeto workspace 2/);

  wrapper.unmount();
});

test('gera o preview de todos os pendentes antes de criar confirmações', async () => {
  fetchOverviewMock.mockResolvedValue(pendingOverview());

  const wrapper = mount(ProductionView, {
    global: { stubs: { RouterLink: RouterLinkStub } },
  });

  await flushPromises();
  await wrapper.get('button.production-overview-batch').trigger('click');
  await flushPromises();

  assert.deepEqual(
    fetchPlanMock.mock.calls.map(([projectId]) => projectId),
    ['project-a', 'project-b'],
  );
  assert.equal(createConfirmationMock.mock.calls.length, 0);
  assert.equal(startDeploymentMock.mock.calls.length, 0);
  assert.equal(fetchDeploymentMock.mock.calls.length, 0);
  assert.match(wrapper.text(), /Revise o lote antes de confirmar/);
  assert.match(wrapper.text(), /Projeto A/);
  assert.match(wrapper.text(), /Projeto B/);
  assert.match(wrapper.text(), /Confirmar e atualizar 2/);

  wrapper.unmount();
});
