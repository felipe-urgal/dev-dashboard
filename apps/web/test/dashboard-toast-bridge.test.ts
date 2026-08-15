import { mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const toastMock = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
}));

vi.mock('vue-sonner', () => ({ toast: toastMock }));

vi.mock('../src/stores/dashboard', async () => {
  const { ref } = await import('vue');

  return {
    dashboardStore: {
      errorMessage: ref(''),
      successMessage: ref(''),
      warningCount: ref(0),
    },
  };
});

import { dashboardStore } from '../src/stores/dashboard';
import { useDashboardToastBridge } from '../src/composables/useDashboardToastBridge';

const Host = defineComponent({
  setup() {
    useDashboardToastBridge();
    return () => h('div');
  },
});

describe('useDashboardToastBridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dashboardStore.errorMessage.value = '';
    dashboardStore.successMessage.value = '';
    dashboardStore.warningCount.value = 0;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('converte errorMessage em toast.error e limpa a store', async () => {
    const wrapper = mount(Host);

    dashboardStore.errorMessage.value = 'Não foi possível escanear.';
    await wrapper.vm.$nextTick();

    expect(toastMock.error).toHaveBeenCalledWith(
      'Não foi possível concluir a ação.',
      { description: 'Não foi possível escanear.' },
    );
    expect(dashboardStore.errorMessage.value).toBe('');

    wrapper.unmount();
  });

  it('converte successMessage em toast.success e limpa a store', async () => {
    const wrapper = mount(Host);

    dashboardStore.successMessage.value = '5 projeto(s) detectado(s).';
    await wrapper.vm.$nextTick();

    expect(toastMock.success).toHaveBeenCalledWith('Ação concluída.', {
      description: '5 projeto(s) detectado(s).',
    });
    expect(dashboardStore.successMessage.value).toBe('');

    wrapper.unmount();
  });

  it('converte warningCount em toast.warning e zera a contagem', async () => {
    const wrapper = mount(Host);

    dashboardStore.warningCount.value = 3;
    await wrapper.vm.$nextTick();

    expect(toastMock.warning).toHaveBeenCalledWith(
      'Scan concluído com avisos.',
      { description: '3 diretório(s) não puderam ser analisados.' },
    );
    expect(dashboardStore.warningCount.value).toBe(0);

    wrapper.unmount();
  });
});
