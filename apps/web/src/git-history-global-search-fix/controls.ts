import { control } from './dom-helpers';
import { stateFor } from './state';

export function restoreControls(section: HTMLElement): void {
  const state = stateFor(section);
  const search = control<HTMLInputElement>(section, 'search');
  const author = control<HTMLSelectElement>(section, 'author');
  const kind = control<HTMLSelectElement>(section, 'kind');
  if (search) {
    search.placeholder = 'Buscar hash, mensagem ou autor nos commits exclusivos…';
    search.setAttribute('aria-label', 'Buscar nos commits exclusivos da referência');
    if (search.value !== state.search) search.value = state.search;
  }
  if (kind && kind.value !== state.kind) kind.value = state.kind;
  if (author && state.author) {
    if (![...author.options].some((option) => option.value === state.author)) {
      const option = document.createElement('option');
      option.value = state.author;
      option.textContent = state.author;
      author.append(option);
    }
    author.value = state.author;
  }

  const count = section.querySelector<HTMLElement>('.git-history-page-filter-count');
  const filtering = Boolean(state.search.trim() || state.author || state.kind !== 'all');
  if (count && filtering) {
    count.textContent = `${state.returned} de ${state.total} resultado(s) nos commits exclusivos`;
  }
}

export function scheduleRestore(section: HTMLElement): void {
  queueMicrotask(() => restoreControls(section));
  window.setTimeout(() => restoreControls(section), 0);
}
