import {
  captureOriginal,
  restoreOriginal,
} from './git-summary-global-search-fix/snapshot';
import { setPagination } from './git-summary-global-search-fix/pagination';
import {
  renderResults,
  setSearchLoading,
} from './git-summary-global-search-fix/list';
import {
  requestJson,
  setSummaryFetcher,
} from './git-summary-global-search-fix/network';
import { stateFor } from './git-summary-global-search-fix/state';
import type { HistoryResponse } from './git-summary-global-search-fix/types';

export { buildSummaryHistorySearchUrl } from './git-summary-global-search-fix/url';
import { buildSummaryHistorySearchUrl } from './git-summary-global-search-fix/url';

async function loadSearchPage(
  section: HTMLElement,
  requestedPage: number,
): Promise<void> {
  const state = stateFor(section);
  if (!state.query.trim() || !state.projectId) return;
  captureOriginal(section);
  state.historyRequest?.abort();
  state.detailRequest?.abort();
  const controller = new AbortController();
  state.historyRequest = controller;
  state.selectedHash = '';
  section
    .querySelector('.git-summary-history-shell')
    ?.classList.remove('is-inspecting');
  section.querySelector('.git-summary-commit-detail')?.replaceChildren();
  setSearchLoading(section);

  try {
    const response = await requestJson<HistoryResponse>(
      buildSummaryHistorySearchUrl(state.projectId, state.query, requestedPage),
      controller.signal,
    );
    if (controller.signal.aborted) return;
    state.branch = response.history.branch;
    state.page = response.history.page;
    state.pageSize = response.history.pageSize;
    state.total = response.history.total;
    state.totalPages = response.history.totalPages;
    state.commits = response.history.commits;
    renderResults(section);
  } catch (error) {
    if (controller.signal.aborted) return;
    const list = section.querySelector<HTMLElement>(
      '.git-summary-history-list',
    );
    const count = section.querySelector<HTMLElement>(
      '.git-summary-history-count',
    );
    list?.replaceChildren();
    const message = document.createElement('p');
    message.className = 'git-summary-history-empty is-error';
    message.textContent =
      error instanceof Error
        ? error.message
        : 'Não foi possível buscar o histórico.';
    list?.append(message);
    if (count) count.textContent = 'Busca indisponível';
    state.totalPages = 0;
    setPagination(section);
  } finally {
    if (state.historyRequest === controller) state.historyRequest = undefined;
  }
}

function resetForBranchChange(
  section: HTMLElement,
  input: HTMLInputElement,
): void {
  const state = stateFor(section);
  if (!state.query && !state.snapshot) return;
  if (state.debounceTimer) window.clearTimeout(state.debounceTimer);
  state.historyRequest?.abort();
  state.detailRequest?.abort();
  state.query = '';
  state.snapshot = undefined;
  state.selectedHash = '';
  input.value = '';
  section
    .querySelector('.git-summary-history-shell')
    ?.classList.remove('is-inspecting');
  section.querySelector('.git-summary-commit-detail')?.replaceChildren();
}

function enhanceSection(section: HTMLElement): void {
  if (section.dataset.summaryGlobalSearch === 'true') return;
  const input = section.querySelector<HTMLInputElement>(
    '.git-summary-history-search input',
  );
  const pagination = section.querySelector<HTMLElement>(
    '.git-summary-history-pagination',
  );
  if (!input || !pagination) return;
  section.dataset.summaryGlobalSearch = 'true';
  const state = stateFor(section);
  input.placeholder = 'Buscar em todo o histórico…';
  input.setAttribute(
    'aria-label',
    'Buscar em todos os commits da branch atual',
  );

  input.addEventListener(
    'input',
    (event) => {
      event.stopImmediatePropagation();
      state.query = input.value;
      if (state.debounceTimer) window.clearTimeout(state.debounceTimer);
      if (!state.query.trim()) {
        restoreOriginal(section);
        return;
      }
      captureOriginal(section);
      state.debounceTimer = window.setTimeout(() => {
        state.debounceTimer = undefined;
        void loadSearchPage(section, 1);
      }, 300);
    },
    { capture: true },
  );

  pagination.addEventListener(
    'click',
    (event) => {
      if (!state.query.trim()) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest<HTMLButtonElement>('[data-history-page]');
      if (!button) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (button.dataset.historyPage === 'previous' && state.page > 1) {
        void loadSearchPage(section, state.page - 1);
      }
      if (
        button.dataset.historyPage === 'next' &&
        state.page < state.totalPages
      ) {
        void loadSearchPage(section, state.page + 1);
      }
    },
    true,
  );

  const branch = section.querySelector<HTMLElement>(
    '.git-status-grid article:first-child strong',
  );
  if (branch) {
    const observer = new MutationObserver(() =>
      resetForBranchChange(section, input),
    );
    observer.observe(branch, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }
}

function scan(root: ParentNode = document): void {
  if (
    root instanceof HTMLElement &&
    root.matches('.git-summary-history-shell')
  ) {
    const section = root.closest<HTMLElement>('.git-summary-page');
    if (section) enhanceSection(section);
  }
  root
    .querySelectorAll<HTMLElement>('.git-summary-history-shell')
    .forEach((shell) => {
      const section = shell.closest<HTMLElement>('.git-summary-page');
      if (section) enhanceSection(section);
    });
}

export function installGitSummaryGlobalSearchFix(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (document.documentElement.dataset.gitSummaryGlobalSearch === 'true')
    return;
  document.documentElement.dataset.gitSummaryGlobalSearch = 'true';
  setSummaryFetcher(window.fetch.bind(window));
  scan();
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof HTMLElement) scan(node);
      }
    }
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}
