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

// jsdom não implementa canvas de verdade (getContext existe mas lança "not
// implemented"); @xterm/xterm sonda suporte a Canvas2D ao ser importado
// (antes mesmo de instanciar um Terminal), então qualquer teste que monte um
// componente que importe @xterm/xterm precisa desse stub.
HTMLCanvasElement.prototype.getContext = () => null;

// jsdom não implementa window.matchMedia; @xterm/xterm consulta a densidade
// de pixels da tela via matchMedia ao abrir um Terminal.
if (!window.matchMedia) {
  window.matchMedia = () =>
    ({
      matches: false,
      media: '',
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

// jsdom não implementa ResizeObserver; usado pelos painéis de terminal
// (Terminal/Console e a PoC de testes via PTY) para reajustar o xterm.js.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    public observe(): void {}
    public unobserve(): void {}
    public disconnect(): void {}
  };
}
