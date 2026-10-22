import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  fetchLocalServices: vi.fn(),
  fetchLocalServicePlan: vi.fn(),
  applyLocalServiceAction: vi.fn(),
  fetchLocalServiceLogs: vi.fn(),
}));
const confirmDialog = vi.hoisted(() => vi.fn());
vi.mock('../src/api/local-services', () => api);
vi.mock('../src/stores/app-dialog', () => ({ confirmDialog }));
import LocalServicesView from '../src/views/LocalServicesView.vue';

const active = {
  id: 'home-music',
  name: 'Home Music',
  unit: 'home-music.service',
  scope: 'system',
  state: 'running',
  bootState: 'enabled',
  readiness: 'ready',
  controllable: true,
  reason: null,
  observedAt: '2026-10-22T12:00:00.000Z',
};
const plan = {
  action: 'stop',
  confirmation: 'a'.repeat(64),
  expectedState: 'running',
  expiresAt: '2026-10-22T12:00:30.000Z',
  service: active,
};

describe('local services lifecycle feedback', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    api.fetchLocalServices.mockResolvedValue([active]);
    api.fetchLocalServicePlan.mockResolvedValue(plan);
    confirmDialog.mockResolvedValue(true);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps a stop error visible after automatic refresh and manual refresh', async () => {
    api.applyLocalServiceAction.mockRejectedValue(
      new Error('Helper não autorizado.'),
    );
    const wrapper = mount(LocalServicesView);
    await flushPromises();

    const stop = wrapper
      .findAll('button')
      .find((button) => button.text() === 'Parar');
    expect(stop).toBeDefined();
    await stop!.trigger('click');
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toContain(
      'Helper não autorizado.',
    );
    await vi.advanceTimersByTimeAsync(10_000);
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain(
      'Helper não autorizado.',
    );

    const reload = wrapper
      .findAll('button')
      .find((button) => button.text() === 'Atualizar estado');
    await reload!.trigger('click');
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain(
      'Helper não autorizado.',
    );
    wrapper.unmount();
  });

  it('allows restart after failed unit and shows recovered state', async () => {
    api.fetchLocalServices.mockResolvedValue([
      { ...active, state: 'failed', readiness: 'unknown' },
    ]);
    api.fetchLocalServicePlan.mockResolvedValue({
      ...plan,
      action: 'start',
      expectedState: 'failed',
    });
    api.applyLocalServiceAction.mockResolvedValue({
      action: 'start',
      status: 'completed',
      service: active,
      message: 'Estado confirmado.',
    });
    const wrapper = mount(LocalServicesView);
    await flushPromises();
    const start = wrapper
      .findAll('button')
      .find((button) => button.text() === 'Iniciar');
    expect(start?.attributes('disabled')).toBeUndefined();
    await start!.trigger('click');
    await flushPromises();
    expect(api.applyLocalServiceAction).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain('Estado confirmado.');
    wrapper.unmount();
  });
});
