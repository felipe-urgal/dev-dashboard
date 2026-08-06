import { el, updatePressed } from './dom-helpers';
import { isErrorText } from './text-helpers';
import type { InspectorState } from './types';

export function applyFilters(shell: HTMLElement, state: InspectorState): void {
  const viewport = shell.querySelector<HTMLElement>('.tests-log-output');
  const rows = Array.from(
    shell.querySelectorAll<HTMLElement>('.tests-log-lines > li'),
  );
  if (!viewport) return;
  viewport.classList.toggle('test-log-inspector-wrap', state.wrapLines);
  viewport.classList.toggle('test-log-inspector-nowrap', !state.wrapLines);
  const query = state.query.trim().toLocaleLowerCase('pt-BR');
  const context = new Set<number>();
  if (state.failuresOnly) {
    rows.forEach((row, index) => {
      if (
        row.classList.contains('tests-log-line-error') ||
        isErrorText(row.textContent ?? '')
      ) {
        for (let offset = -2; offset <= 2; offset += 1)
          context.add(index + offset);
      }
    });
  }
  let visible = 0;
  rows.forEach((row, index) => {
    const matchesQuery =
      !query ||
      (row.textContent ?? '').toLocaleLowerCase('pt-BR').includes(query);
    const show = matchesQuery && (!state.failuresOnly || context.has(index));
    if (row.style.display !== (show ? '' : 'none'))
      row.style.display = show ? '' : 'none';
    if (show) visible += 1;
  });
  const count = shell.querySelector<HTMLElement>('.test-log-explorer-count');
  if (count) count.textContent = `${visible} de ${rows.length} linhas`;
}

export function toolbarFor(
  shell: HTMLElement,
  state: InspectorState,
): HTMLElement {
  const current = shell.querySelector<HTMLElement>(
    ':scope > .test-log-explorer-toolbar',
  );
  if (current) return current;
  const toolbar = el('div', 'test-log-explorer-toolbar');
  const search = el('label', 'test-log-explorer-search');
  search.append(el('span', undefined, 'Buscar no log'));
  const input = el('input');
  input.type = 'search';
  input.placeholder = 'Mensagem, arquivo ou valor…';
  input.addEventListener('input', () => {
    state.query = input.value;
    applyFilters(shell, state);
  });
  search.append(input);
  const controls = el('div', 'test-log-explorer-controls');
  const wrap = el('button', undefined, 'Quebrar linhas');
  wrap.type = 'button';
  updatePressed(wrap, state.wrapLines);
  wrap.addEventListener('click', () => {
    state.wrapLines = !state.wrapLines;
    updatePressed(wrap, state.wrapLines);
    applyFilters(shell, state);
  });
  const failures = el('button', undefined, 'Contexto das falhas');
  failures.type = 'button';
  updatePressed(failures, state.failuresOnly);
  failures.addEventListener('click', () => {
    state.failuresOnly = !state.failuresOnly;
    updatePressed(failures, state.failuresOnly);
    applyFilters(shell, state);
  });
  controls.append(
    wrap,
    failures,
    el('span', 'test-log-explorer-count', '0 linhas'),
  );
  toolbar.append(search, controls);
  shell.insertBefore(toolbar, shell.querySelector('.tests-log-output'));
  return toolbar;
}
