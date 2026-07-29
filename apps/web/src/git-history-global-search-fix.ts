type CompatibleTimer = number | ReturnType<typeof setTimeout>;

interface HistorySearchState {
  search: string;
  author: string;
  kind: 'all' | 'regular' | 'merge';
  pendingFirstPage: boolean;
  debounceTimer: CompatibleTimer | undefined;
  total: number;
  returned: number;
}

interface HistoryResponsePayload {
  history?: {
    total?: number;
    commits?: unknown[];
  };
}

const stateBySection = new WeakMap<HTMLElement, HistorySearchState>();

function historySection(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.git-history-page');
}

function control<T extends HTMLInputElement | HTMLSelectElement>(
  section: HTMLElement,
  name: string,
): T | null {
  return section.querySelector<T>(`[data-history-control="${name}"]`);
}

function stateFor(section: HTMLElement): HistorySearchState {
  const existing = stateBySection.get(section);
  if (existing) return existing;
  const state: HistorySearchState = {
    search: control<HTMLInputElement>(section, 'search')?.value ?? '',
    author: control<HTMLSelectElement>(section, 'author')?.value ?? '',
    kind: (control<HTMLSelectElement>(section, 'kind')?.value as HistorySearchState['kind']) || 'all',
    pendingFirstPage: false,
    debounceTimer: undefined,
    total: 0,
    returned: 0,
  };
  stateBySection.set(section, state);
  return state;
}

function isHistoryListRequest(url: URL): boolean {
  return /\/api\/projects\/[^/]+\/git\/commits$/.test(url.pathname);
}

export function applyGlobalHistoryFilters(
  value: string,
  filters: Pick<HistorySearchState, 'search' | 'author' | 'kind'>,
  forceFirstPage = false,
): string {
  const url = new URL(value, 'http://dashboard.local');
  const setOrDelete = (key: string, item: string): void => {
    const normalized = item.trim();
    if (normalized) url.searchParams.set(key, normalized);
    else url.searchParams.delete(key);
  };
  setOrDelete('search', filters.search);
  setOrDelete('author', filters.author);
  if (filters.kind !== 'all') url.searchParams.set('kind', filters.kind);
  else url.searchParams.delete('kind');
  if (forceFirstPage) url.searchParams.set('page', '1');
  return url.pathname + url.search;
}

function requestUrl(input: RequestInfo | URL): URL | null {
  try {
    if (typeof Request !== 'undefined' && input instanceof Request) {
      return new URL(input.url, window.location.href);
    }
    return new URL(String(input), window.location.href);
  } catch {
    return null;
  }
}

function replaceRequestUrl(input: RequestInfo | URL, url: URL): RequestInfo | URL {
  if (typeof Request !== 'undefined' && input instanceof Request) {
    return new Request(url.toString(), input);
  }
  if (input instanceof URL) return url;
  return url.toString();
}

function restoreControls(section: HTMLElement): void {
  const state = stateFor(section);
  const search = control<HTMLInputElement>(section, 'search');
  const author = control<HTMLSelectElement>(section, 'author');
  const kind = control<HTMLSelectElement>(section, 'kind');
  if (search) {
    search.placeholder = 'Buscar hash, mensagem ou autor em todos os commits…';
    search.setAttribute('aria-label', 'Buscar em todos os commits da referência');
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
    count.textContent = `${state.returned} de ${state.total} resultado(s) em todo o histórico`;
  }
}

function scheduleRestore(section: HTMLElement): void {
  queueMicrotask(() => restoreControls(section));
  window.setTimeout(() => restoreControls(section), 0);
}

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
