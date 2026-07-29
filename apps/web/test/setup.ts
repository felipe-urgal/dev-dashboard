import { defineComponent, h } from 'vue';
import { config } from '@vue/test-utils';

config.global.stubs.RouterLink = defineComponent({
  inheritAttrs: false,
  setup(_props, context) {
    return () => h('a', context.attrs, context.slots.default?.());
  },
});
