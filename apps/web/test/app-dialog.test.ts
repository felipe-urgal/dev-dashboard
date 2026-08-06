import assert from 'node:assert/strict';
import { test } from 'vitest';

import { flushPromises, mount } from '@vue/test-utils';

import AppDialog from '../src/components/AppDialog.vue';
import { alertDialog, confirmDialog } from '../src/stores/app-dialog';

test('resolve confirmação ao cancelar ou confirmar pelo modal', async () => {
  const wrapper = mount(AppDialog, {
    attachTo: document.body,
    global: {
      stubs: {
        Teleport: true,
      },
    },
  });

  const cancelled = confirmDialog({
    title: 'Remover item?',
    message: 'Esta ação não pode ser desfeita.',
    confirmLabel: 'Remover',
    tone: 'danger',
  });
  await flushPromises();

  assert.match(wrapper.get('[role="alertdialog"]').text(), /Remover item/);
  assert.match(wrapper.text(), /Esta ação não pode ser desfeita/);
  assert.equal(wrapper.get('.danger-button').text(), 'Remover');

  await wrapper.get('.secondary-button').trigger('click');
  assert.equal(await cancelled, false);
  assert.equal(wrapper.find('[role="alertdialog"]').exists(), false);

  const confirmed = confirmDialog({
    title: 'Executar ação?',
    message: 'O projeto será atualizado.',
    confirmLabel: 'Executar',
  });
  await flushPromises();

  await wrapper.get('.primary-button').trigger('click');
  assert.equal(await confirmed, true);
  assert.equal(wrapper.find('[role="alertdialog"]').exists(), false);

  wrapper.unmount();
});

test('fecha aviso simples com uma única ação', async () => {
  const wrapper = mount(AppDialog, {
    global: {
      stubs: {
        Teleport: true,
      },
    },
  });

  const closed = alertDialog({
    title: 'Operação concluída',
    message: 'As alterações foram salvas.',
  });
  await flushPromises();

  assert.equal(wrapper.find('.secondary-button').exists(), false);
  assert.equal(wrapper.get('.primary-button').text(), 'Entendi');

  await wrapper.get('.primary-button').trigger('click');
  await closed;
  assert.equal(wrapper.find('[role="alertdialog"]').exists(), false);

  wrapper.unmount();
});
