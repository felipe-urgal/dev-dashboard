import assert from 'node:assert/strict';
import { test } from 'vitest';

import { mount } from '@vue/test-utils';

import Card from '../src/components/Card.vue';

test('Card renderiza o slot default com padding padrão e sem cabeçalho vazio', () => {
  const wrapper = mount(Card, { slots: { default: '<p class="child">olá</p>' } });
  const root = wrapper.get('.dd-card');
  assert.equal(root.classes().includes('dd-card-padded'), true);
  assert.equal(wrapper.find('.dd-card-header').exists(), false, 'header não deve aparecer sem slots');
  assert.equal(wrapper.find('.child').text(), 'olá');
});

test('Card renderiza header e actions quando os slots são fornecidos', () => {
  const wrapper = mount(Card, {
    slots: {
      header: '<h3>Título</h3>',
      actions: '<button>Ação</button>',
      default: '<p>corpo</p>',
    },
  });
  assert.equal(wrapper.get('.dd-card-heading h3').text(), 'Título');
  assert.equal(wrapper.get('.dd-card-actions button').text(), 'Ação');
  assert.match(wrapper.text(), /corpo/);
});

test('Card aceita tag customizada e o modificador interactive', () => {
  const wrapper = mount(Card, {
    props: { tag: 'article', interactive: true, padded: false },
    slots: { default: 'body' },
  });
  assert.equal(wrapper.element.tagName, 'ARTICLE');
  const root = wrapper.get('.dd-card');
  assert.equal(root.classes().includes('dd-card-interactive'), true);
  assert.equal(root.classes().includes('dd-card-padded'), false);
});
