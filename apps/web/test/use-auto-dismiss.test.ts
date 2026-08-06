import assert from 'node:assert/strict';
import { defineComponent, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { afterEach, test, vi } from 'vitest';

import { useAutoDismiss } from '../src/composables/useAutoDismiss';

afterEach(() => {
  vi.useRealTimers();
});

test('fecha mensagens automaticamente e reinicia o prazo quando mudam', async () => {
  vi.useFakeTimers();
  const wrapper = mount(
    defineComponent({
      setup() {
        const message = ref('');
        useAutoDismiss(message, '', 1_000);
        return { message };
      },
      template: '<p>{{ message }}</p>',
    }),
  );

  wrapper.vm.message = 'Primeiro alerta';
  await vi.advanceTimersByTimeAsync(750);
  wrapper.vm.message = 'Alerta atualizado';
  await vi.advanceTimersByTimeAsync(750);
  assert.equal(wrapper.text(), 'Alerta atualizado');

  await vi.advanceTimersByTimeAsync(250);
  assert.equal(wrapper.text(), '');
  wrapper.unmount();
});
