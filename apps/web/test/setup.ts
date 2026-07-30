import { defineComponent, h } from 'vue';
import { config } from '@vue/test-utils';

config.global.stubs.RouterLink = defineComponent({
  inheritAttrs: false,
  setup(_props, context) {
    return () => h('a', context.attrs, context.slots.default?.());
  },
});

// jsdom não implementa scrollIntoView; código de produção o chama em resposta a
// interações do usuário (ex. abrir o diff de um arquivo), então testes precisam de um stub.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
