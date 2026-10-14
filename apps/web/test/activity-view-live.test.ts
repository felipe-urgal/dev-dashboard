import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActivitySnapshot } from '@dev-dashboard/contracts';

const fetchActivity = vi.hoisted(() => vi.fn());
vi.mock('../src/api/activity', () => ({ fetchActivity }));
vi.mock('../src/stores/dashboard', async () => {
  const { computed } = await import('vue');
  return { dashboardStore: { knownProjects: computed(() => []) } };
});
vi.mock('../src/utils/activity-resources', () => ({
  resolveActivityResource: () => ({ label: 'Recurso', known: false, to: null }),
  canCancelActivityJob: () => false,
  cancelActivityJob: vi.fn(),
}));
import ActivityView from '../src/views/ActivityView.vue';

const snapshot = (active = false): ActivitySnapshot => ({
  generatedAt: '2026-10-14T12:00:00Z',
  partial: true,
  unavailableDomains: ['git'],
  jobs: active
    ? [
        {
          id: 'job-1',
          projectId: 'p1',
          domain: 'agent',
          action: 'run',
          status: 'running',
          cancelSupported: false,
        },
      ]
    : [],
  events: [
    {
      id: 'event-1',
      projectId: 'p1',
      domain: 'git',
      type: 'change',
      summary: 'Mudança registrada',
      status: 'succeeded',
      occurredAt: '2026-10-14T12:00:00Z',
    },
  ],
});
const mountView = () =>
  mount(ActivityView, {
    global: {
      stubs: {
        RouterLink: { template: '<a><slot /></a>' },
        EmptyState: { template: '<div class="empty-stub" />' },
        StatusBadge: { template: '<span><slot /></span>' },
      },
    },
  });

describe('Activity live snapshot', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fetchActivity.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  it('keeps one adaptive scheduler and cleans it on unmount', async () => {
    fetchActivity.mockResolvedValue(snapshot(true));
    const wrapper = mountView();
    await flushPromises();
    expect(fetchActivity).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(3000);
    expect(fetchActivity).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(1);
    wrapper.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('keeps prior evidence and partial status when refresh fails', async () => {
    fetchActivity
      .mockResolvedValueOnce(snapshot(true))
      .mockRejectedValueOnce(new Error('Offline'));
    const wrapper = mountView();
    await flushPromises();
    expect(wrapper.text()).toContain('Snapshot parcial');
    expect(wrapper.text()).toContain('Atualizado em');
    await vi.advanceTimersByTimeAsync(3000);
    await flushPromises();
    expect(wrapper.text()).toContain('Mudança registrada');
    expect(wrapper.text()).toContain('Offline');
    wrapper.unmount();
  });
  it('polls idle snapshots slowly and filters locally without mutating source', async () => {
    fetchActivity.mockResolvedValue(snapshot(false));
    const wrapper = mountView();
    await flushPromises();
    await vi.advanceTimersByTimeAsync(3000);
    expect(fetchActivity).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain('Mudança registrada');
    await wrapper.findAll('select')[2]!.setValue('failed');
    expect(wrapper.text()).not.toContain('Mudança registrada');
    await wrapper.findAll('select')[2]!.setValue('');
    expect(wrapper.text()).toContain('Mudança registrada');
    wrapper.unmount();
  });
});
