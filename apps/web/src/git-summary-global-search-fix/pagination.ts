import { stateFor } from './state';

export function setPagination(section: HTMLElement): void {
  const state = stateFor(section);
  const previous = section.querySelector<HTMLButtonElement>('[data-history-page="previous"]');
  const next = section.querySelector<HTMLButtonElement>('[data-history-page="next"]');
  const label = section.querySelector<HTMLElement>('.git-summary-history-page-label');
  if (previous) previous.disabled = state.page <= 1 || state.totalPages <= 1;
  if (next) next.disabled = state.totalPages <= 1 || state.page >= state.totalPages;
  if (label) {
    label.textContent = state.totalPages > 0
      ? `Página ${state.page} de ${state.totalPages}`
      : 'Nenhuma página';
  }
}
