import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, ref, type Ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ManagedProcessStatus } from '@dev-dashboard/contracts';

import { useProjectServerHealth } from '../src/composables/useProjectServerHealth';

const fetchProjectServerHealth = vi.hoisted(() => vi.fn());

vi.mock('../src/api', () => ({
  fetchProjectServerHealth,
}));

function mountHarness(
  projectId: Ref<string>,
  processStatus: Ref<ManagedProcessStatus>,
) {
  return mount(
    defineComponent({
      setup() {
        useProjectServerHealth(() => projectId.value, processStatus);

        return {};
      },
      template: '<div />',
    }),
  );
}

describe('polling do health check do servidor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fetchProjectServerHealth.mockReset();
    fetchProjectServerHealth.mockImplementation(async (projectId: string) => ({
      projectId,
      path: '/health',
      pathSource: 'detected',
      status: 'healthy',
      httpStatus: 200,
      latencyMs: 4,
      checkedAt: '2026-08-03T10:00:00.000Z',
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('para de consultar depois que o painel é desmontado', async () => {
    const projectId = ref('project-a');
    const processStatus = ref<ManagedProcessStatus>('stopped');
    const wrapper = mountHarness(projectId, processStatus);

    processStatus.value = 'running';
    await flushPromises();
    expect(fetchProjectServerHealth).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(15_000);
    await flushPromises();
    expect(fetchProjectServerHealth).toHaveBeenCalledTimes(2);

    wrapper.unmount();
    await vi.advanceTimersByTimeAsync(30_000);
    await flushPromises();

    expect(fetchProjectServerHealth).toHaveBeenCalledTimes(2);
  });

  it('cancela o timer anterior ao trocar de projeto', async () => {
    const projectId = ref('project-a');
    const processStatus = ref<ManagedProcessStatus>('stopped');
    const wrapper = mountHarness(projectId, processStatus);

    processStatus.value = 'running';
    await flushPromises();
    await vi.advanceTimersByTimeAsync(10_000);

    projectId.value = 'project-b';
    await flushPromises();
    expect(fetchProjectServerHealth).toHaveBeenNthCalledWith(2, 'project-b');

    await vi.advanceTimersByTimeAsync(5_000);
    await flushPromises();
    expect(fetchProjectServerHealth).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(10_000);
    await flushPromises();
    expect(fetchProjectServerHealth).toHaveBeenNthCalledWith(3, 'project-b');

    wrapper.unmount();
  });
});
