import { mount } from '@vue/test-utils';
import { afterEach, expect, it, vi } from 'vitest';

import LoadingSkeleton from '../src/components/LoadingSkeleton.vue';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it('anuncia o carregamento imediatamente e atrasa apenas a parte visual', async () => {
  vi.useFakeTimers();
  const wrapper = mount(LoadingSkeleton, {
    props: { label: 'Carregando projetos detectados…', rows: 3 },
  });

  expect(wrapper.get('[role="status"]').text()).toBe('Carregando projetos detectados…');
  expect(wrapper.find('.loading-skeleton-list').exists()).toBe(false);

  await vi.advanceTimersByTimeAsync(149);
  expect(wrapper.find('.loading-skeleton-list').exists()).toBe(false);

  await vi.advanceTimersByTimeAsync(1);
  expect(wrapper.findAll('.loading-skeleton-row')).toHaveLength(3);
  expect(wrapper.get('.loading-skeleton-list').attributes('aria-hidden')).toBe('true');
});

it('pode aparecer imediatamente sem perder o estado acessível', () => {
  const wrapper = mount(LoadingSkeleton, {
    props: { delayMs: 0, rows: 2 },
  });

  expect(wrapper.findAll('.loading-skeleton-row')).toHaveLength(2);
  expect(wrapper.get('.loading-skeleton').attributes('aria-busy')).toBe('true');
  expect(wrapper.get('[role="status"]').text()).toBe('Carregando conteúdo…');
});

it('cancela o atraso visual quando é desmontado', () => {
  vi.useFakeTimers();
  const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
  const wrapper = mount(LoadingSkeleton);

  wrapper.unmount();

  expect(clearTimeoutSpy).toHaveBeenCalledOnce();
});
