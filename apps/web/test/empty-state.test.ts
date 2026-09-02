import assert from 'node:assert/strict';
import { test } from 'vitest';

import { mount } from '@vue/test-utils';

import EmptyState from '../src/components/EmptyState.vue';

test('EmptyState renderiza a estrutura visual compartilhada', () => {
  const wrapper = mount(EmptyState, {
    props: {
      icon: '◇',
      title: 'Nenhum projeto carregado',
      description: 'Cadastre ou selecione um workspace.',
    },
  });

  const root = wrapper.get('.empty-state');
  assert.equal(root.get('.empty-icon').text(), '◇');
  assert.equal(root.get('h3').text(), 'Nenhum projeto carregado');
  assert.equal(root.get('p').text(), 'Cadastre ou selecione um workspace.');
  assert.equal(root.get('.empty-icon').attributes('aria-hidden'), 'true');
});

test('EmptyState preserva atributos, classes e ação da superfície chamadora', () => {
  const wrapper = mount(EmptyState, {
    props: {
      title: 'Não foi possível carregar',
      description: 'Falha temporária.',
    },
    attrs: {
      class: 'dashboard-error-state',
      role: 'alert',
    },
    slots: {
      icon: '<span class="custom-icon">!</span>',
      actions: '<button class="retry">Tentar novamente</button>',
    },
  });

  const root = wrapper.get('.empty-state');
  assert.equal(root.classes().includes('dashboard-error-state'), true);
  assert.equal(root.attributes('role'), 'alert');
  assert.equal(root.get('.custom-icon').text(), '!');
  assert.equal(root.get('.retry').text(), 'Tentar novamente');
});
