import { describe, expect, it } from 'vitest';

import { mount } from '@vue/test-utils';

import RailsParamsTree from '../src/components/RailsParamsTree.vue';

describe('RailsParamsTree', () => {
  it('só desenha a moldura (fundo/borda) no nível raiz, não em cada aninhamento', () => {
    const wrapper = mount(RailsParamsTree, {
      props: {
        value: {
          options: {
            notify: true,
            webhook: { url: 'https://example.com', retries: 2 },
          },
        },
      },
    });

    expect(wrapper.findAll('.ptree-root')).toHaveLength(1);
    expect(wrapper.findAll('.ptree').length).toBeGreaterThan(1);
    expect(wrapper.text()).toContain('webhook');
    expect(wrapper.text()).toContain('retries');
  });
});
