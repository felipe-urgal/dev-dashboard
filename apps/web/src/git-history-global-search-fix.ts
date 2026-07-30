export { applyGlobalHistoryFilters } from './git-history-global-search-fix/url';

import { control, historySection } from './git-history-global-search-fix/dom-helpers';
import { restoreControls, scheduleRestore } from './git-history-global-search-fix/controls';
import { stateFor } from './git-history-global-search-fix/state';
import {
  applyGlobalHistoryFilters,
  isHistoryListRequest,
  replaceRequestUrl,
  requestUrl,
} from './git-history-global-search-fix/url';
import type { HistoryResponsePayload, HistorySearchState } from './git-history-global-search-fix/types';

function refresh(section: HTMLElement): void {
  section.querySelector<HTMLButtonElement>('.git-history-page-refresh')?.click();
}

function enhanceSection(section: HTMLElement): void {
  if (section.dataset.globalHistorySearch === 'true') {
    restoreControls(section);
    return;
  }
  section.dataset.globalHistorySearch = 'true';
  const state = stateFor(section);
  const search = control<HTMLInputElement>(section, 'search');
  const author = control<HTMLSelectElement>(section, 'author');
  const kind = control<HTMLSelectElement>(section, 'kind');
  const reference = control<HTMLSelectElement>(section, 'reference');

  search?.addEventListener('input', () => {
    state.search = search.value;
    state.pendingFirstPage = true;
    if (state.debounceTimer) clearTimeout(state.debounceTimer);
    state.debounceTimer = window.setTimeout(() => refresh(section), 350);
  });

  author?.addEventListener('change', () => {
    state.author = author.value;
    state.pendingFirstPage = true;
    refresh(section);
  });

  kind?.addEventListener('change', () => {
    state.kind = kind.value as HistorySearchState['kind'];
    state.pendingFirstPage = true;
    refresh(section);
  });

  reference?.addEventListener('change', () => {
    state.search = '';
    state.author = '';
    state.kind = 'all';
    state.pendingFirstPage = false;
  }, true);

  section.querySelector('.git-history-page-pagination')?.addEventListener('click', () => {
    scheduleRestore(section);
  }, true);

  restoreControls(section);
}

function scan(root: ParentNode = document): void {
  if (root instanceof HTMLElement && root.matches('.git-history-page')) enhanceSection(root);
  root.querySelectorAll<HTMLElement>('.git-history-page').forEach(enhanceSection);
}

export function installGitHistoryGlobalSearchFix(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (document.documentElement.dataset.gitHistoryGlobalSearch === 'true') return;
  document.documentElement.dataset.gitHistoryGlobalSearch = 'true';

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const section = historySection();
    const sourceUrl = requestUrl(input);
    if (!section || !sourceUrl || !isHistoryListRequest(sourceUrl)) {
      return originalFetch(input, init);
    }

    const state = stateFor(section);
    const filteredPath = applyGlobalHistoryFilters(
      sourceUrl.toString(),
      state,
      state.pendingFirstPage,
    );
    state.pendingFirstPage = false;
    const filteredUrl = new URL(filteredPath, sourceUrl.origin);
    const response = await originalFetch(replaceRequestUrl(input, filteredUrl), init);

    void response.clone().json().then((payload: HistoryResponsePayload) => {
      state.total = payload.history?.total ?? 0;
      state.returned = payload.history?.commits?.length ?? 0;
      scheduleRestore(section);
    }).catch(() => undefined);

    return response;
  };

  scan();
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof HTMLElement) scan(node);
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}
