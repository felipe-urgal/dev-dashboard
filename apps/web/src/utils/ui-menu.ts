import { h, type VNodeChild } from 'vue';

/** Rótulo de item destrutivo para os menus (NDropdown), em vermelho. */
export function dangerMenuLabel(text: string): () => VNodeChild {
  return () => h('span', { class: 'ui-menu-danger' }, text);
}
