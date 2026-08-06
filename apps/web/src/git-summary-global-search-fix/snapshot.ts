import { stateFor } from './state';

export function captureOriginal(section: HTMLElement): void {
  const state = stateFor(section);
  if (state.snapshot) return;
  const list = section.querySelector<HTMLElement>('.git-summary-history-list');
  const detail = section.querySelector<HTMLElement>(
    '.git-summary-commit-detail',
  );
  const count = section.querySelector<HTMLElement>(
    '.git-summary-history-count',
  );
  const pageLabel = section.querySelector<HTMLElement>(
    '.git-summary-history-page-label',
  );
  const previous = section.querySelector<HTMLButtonElement>(
    '[data-history-page="previous"]',
  );
  const next = section.querySelector<HTMLButtonElement>(
    '[data-history-page="next"]',
  );
  const shell = section.querySelector<HTMLElement>(
    '.git-summary-history-shell',
  );
  if (!list || !detail) return;
  state.snapshot = {
    listNodes: Array.from(list.childNodes),
    detailNodes: Array.from(detail.childNodes),
    countText: count?.textContent ?? '',
    pageLabel: pageLabel?.textContent ?? '',
    previousDisabled: previous?.disabled ?? true,
    nextDisabled: next?.disabled ?? true,
    inspecting: shell?.classList.contains('is-inspecting') ?? false,
  };
}

export function restoreOriginal(section: HTMLElement): void {
  const state = stateFor(section);
  state.historyRequest?.abort();
  state.detailRequest?.abort();
  state.historyRequest = undefined;
  state.detailRequest = undefined;
  state.selectedHash = '';
  const snapshot = state.snapshot;
  state.snapshot = undefined;
  if (!snapshot) return;

  const list = section.querySelector<HTMLElement>('.git-summary-history-list');
  const detail = section.querySelector<HTMLElement>(
    '.git-summary-commit-detail',
  );
  const count = section.querySelector<HTMLElement>(
    '.git-summary-history-count',
  );
  const pageLabel = section.querySelector<HTMLElement>(
    '.git-summary-history-page-label',
  );
  const previous = section.querySelector<HTMLButtonElement>(
    '[data-history-page="previous"]',
  );
  const next = section.querySelector<HTMLButtonElement>(
    '[data-history-page="next"]',
  );
  const shell = section.querySelector<HTMLElement>(
    '.git-summary-history-shell',
  );

  list?.replaceChildren(...snapshot.listNodes);
  detail?.replaceChildren(...snapshot.detailNodes);
  if (count) count.textContent = snapshot.countText;
  if (pageLabel) pageLabel.textContent = snapshot.pageLabel;
  if (previous) previous.disabled = snapshot.previousDisabled;
  if (next) next.disabled = snapshot.nextDisabled;
  shell?.classList.toggle('is-inspecting', snapshot.inspecting);
}
