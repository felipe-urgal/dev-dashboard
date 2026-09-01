import assert from 'node:assert/strict';
import { beforeEach, test, vi } from 'vitest';
import { nextTick } from 'vue';

import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils';

import type { ProductionOverview } from '@dev-dashboard/contracts';

vi.mock('../src/api', () => ({
  fetchProductionOverview: vi.fn(),
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

import { fetchProductionOverview } from '../src/api';
import { dashboardStore } from '../src/stores/dashboard';
import ProductionView from '../src/views/ProductionView.vue';

const fetchOverviewMock = vi.mocked(fetchProductionOverview);

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

beforeEach(() => {
  dashboardStore.selectedWorkspaceId.value = 'workspace-1';
  dashboardStore.scanningWorkspace.value = false;
  fetchOverviewMock.mockReset();
  fetchOverviewMock.mockImplementation(async (workspaceId) =>
    workspaceId === 'workspace-2'
      ? overview('project-2', 'Projeto workspace 2')
      : overview('project-1', 'Projeto workspace 1'),
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
