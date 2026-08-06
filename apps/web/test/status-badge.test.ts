import assert from 'node:assert/strict';
import { test } from 'vitest';

import { mount } from '@vue/test-utils';

import StatusBadge from '../src/components/StatusBadge.vue';

test('StatusBadge renderiza o slot com a classe de tone e tamanho padrão sm', () => {
  const wrapper = mount(StatusBadge, {
    props: { tone: 'success' },
    slots: { default: 'ok' },
  });
  const root = wrapper.get('.dd-status-badge');
  assert.equal(root.text(), 'ok');
  assert.equal(root.classes().includes('dd-status-badge-success'), true);
  assert.equal(root.classes().includes('dd-status-badge-sm'), true);
  assert.equal(root.attributes('data-tone'), 'success');
});

test('StatusBadge respeita size md e cobre todos os tones', () => {
  const tones = ['success', 'warning', 'danger', 'info', 'neutral'] as const;
  for (const tone of tones) {
    const wrapper = mount(StatusBadge, {
      props: { tone, size: 'md' },
      slots: { default: tone },
    });
    const root = wrapper.get('.dd-status-badge');
    assert.equal(
      root.classes().includes(`dd-status-badge-${tone}`),
      true,
      `tone ${tone}`,
    );
    assert.equal(root.classes().includes('dd-status-badge-md'), true);
  }
});
