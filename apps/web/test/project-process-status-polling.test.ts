import { flushPromises, mount } from '@vue/test-utils';
import { computed, defineComponent, ref, type Ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ManagedProcess,
  ManagedProcessStatus,
  Project,
} from '@dev-dashboard/contracts';

import { useProjectProcessStatus } from '../src/composables/useProjectProcessStatus';

const fetchProjectProcess = vi.hoisted(() => vi.fn());

vi.mock('../src/api', () => ({
  fetchProjectProcess,
}));

function project(): Project {
  return {
    id: 'project-a',
    name: 'Projeto A',
    path: '/tmp/project-a',
    type: 'node',
    source: 'standalone',
    enabled: true,
    capabilities: ['server'],
  };
}

function process(status: ManagedProcessStatus): ManagedProcess {
  return {
    id: 'project-a:server',
    projectId: 'project-a',
    kind: 'server',
    status,
  };
}

function mountHarness(currentStatus: Ref<ManagedProcessStatus>) {
  return mount(
    defineComponent({
      setup() {
        const currentProject = ref(project());
        useProjectProcessStatus(() => currentProject.value);

        return {
          currentStatus,
          visibleStatus: computed(() => currentStatus.value),
        };
      },
      template: '<div>{{ visibleStatus }}</div>',
    }),
  );
}

describe('polling do status do processo do servidor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fetchProjectProcess.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('não continua consultando um processo parado', async () => {
    const status = ref<ManagedProcessStatus>('stopped');
    fetchProjectProcess.mockResolvedValue(process('stopped'));
    const wrapper = mountHarness(status);

    await flushPromises();
    expect(fetchProjectProcess).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(30_000);
    await flushPromises();

    expect(fetchProjectProcess).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it('interrompe o polling quando o processo fica parado', async () => {
    const status = ref<ManagedProcessStatus>('running');
    fetchProjectProcess.mockResolvedValueOnce(process('running'));
    fetchProjectProcess.mockResolvedValueOnce(process('stopped'));
    const wrapper = mountHarness(status);

    await flushPromises();
    await vi.advanceTimersByTimeAsync(5_000);
    await flushPromises();
    expect(fetchProjectProcess).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(30_000);
    await flushPromises();

    expect(fetchProjectProcess).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });
});
