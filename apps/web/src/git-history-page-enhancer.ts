import {
  ArrowPathIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
  TagIcon,
  UserCircleIcon,
} from '@heroicons/vue/24/outline';

import { selectCommit } from './git-history/detail';
import { mountIcon, projectIdFromLocation, requestJson } from './git-history/dom-helpers';
import { currentReference } from './git-history/format';
import {
  applyHistoryListWidth,
  buildHistoryResizer,
  readHistoryListWidth,
} from './git-history/list-width';
import {
  closeDetail,
  filteredCommits,
  renderList,
  renderPagination,
  setHistoryLoading,
} from './git-history/list';
import { stateBySection } from './git-history/state';
import { renderAuthorOptions, renderMetrics, renderReferenceOptions, resetFilters } from './git-history/toolbar';
import type {
  GitWorkspaceResponse,
  GitHistoryResponse,
  HistoryCommitKind,
  HistoryPageState,
} from './git-history/types';

export type { GitHistoryCommit, HistoryCommitKind } from './git-history/types';
export { filterHistoryCommits, uniqueHistoryAuthors } from './git-history/filters';
export { clampHistoryListWidth } from './git-history/list-width';

async function loadHistory(
  section: HTMLElement,
  requestedPage: number,
  reset = false,
): Promise<void> {
  const state = stateBySection.get(section);
  if (!state) return;
  state.historyRequest?.abort();
  const controller = new AbortController();
  state.historyRequest = controller;
  if (reset) resetFilters(section);
  closeDetail(section);
  setHistoryLoading(section);

  try {
    const query = new URLSearchParams({
      ref: state.reference,
      page: String(Math.max(1, requestedPage)),
      pageSize: '10',
    });
    const response = await requestJson<GitHistoryResponse>(
      `/api/projects/${encodeURIComponent(state.projectId)}/git/commits?${query.toString()}`,
      controller.signal,
    );
    if (controller.signal.aborted) return;
    state.resolvedReference = response.history.branch;
    state.commits = response.history.commits;
    state.page = response.history.page;
    state.pageSize = response.history.pageSize;
    state.total = response.history.total;
    state.totalPages = response.history.totalPages;
    renderAuthorOptions(section);
    renderMetrics(section);
    renderList(section);
  } catch (error) {
    if (controller.signal.aborted) return;
    const list = section.querySelector<HTMLElement>('.git-history-page-list');
    list?.replaceChildren();
    const message = document.createElement('div');
    message.className = 'git-history-page-empty is-error';
    const title = document.createElement('strong');
    title.textContent = 'Histórico indisponível';
    const description = document.createElement('p');
    description.textContent = error instanceof Error
      ? error.message
      : 'Não foi possível carregar o histórico.';
    message.append(title, description);
    list?.append(message);
  } finally {
    if (state.historyRequest === controller) state.historyRequest = undefined;
    renderPagination(section);
  }
}

function buildMetric(label: string, key: string): HTMLElement {
  const card = document.createElement('article');
  card.dataset.historyMetric = key;
  const span = document.createElement('span');
  span.textContent = label;
  const strong = document.createElement('strong');
  strong.textContent = '—';
  const small = document.createElement('small');
  small.textContent = 'Carregando…';
  card.append(span, strong, small);
  return card;
}

function buildPagination(section: HTMLElement): HTMLElement {
  const footer = document.createElement('footer');
  footer.className = 'git-history-page-pagination';
  const previous = document.createElement('button');
  previous.type = 'button';
  previous.dataset.historyPage = 'previous';
  mountIcon(previous, ChevronLeftIcon, 'git-history-page-pagination-icon');
  const previousText = document.createElement('span');
  previousText.textContent = 'Anterior';
  previous.append(previousText);
  previous.addEventListener('click', () => {
    const state = stateBySection.get(section);
    if (state && state.page > 1) void loadHistory(section, state.page - 1, true);
  });

  const label = document.createElement('span');
  label.className = 'git-history-page-pagination-label';
  label.textContent = 'Nenhuma página';

  const next = document.createElement('button');
  next.type = 'button';
  next.dataset.historyPage = 'next';
  const nextText = document.createElement('span');
  nextText.textContent = 'Próxima';
  next.append(nextText);
  mountIcon(next, ChevronRightIcon, 'git-history-page-pagination-icon');
  next.addEventListener('click', () => {
    const state = stateBySection.get(section);
    if (state && state.page < state.totalPages) void loadHistory(section, state.page + 1, true);
  });
  footer.append(previous, label, next);
  return footer;
}

function buildPage(section: HTMLElement, projectId: string): void {
  section.replaceChildren();
  section.classList.add('git-history-page');

  const metrics = document.createElement('div');
  metrics.className = 'git-history-page-metrics';
  metrics.append(
    buildMetric('Referência', 'reference'),
    buildMetric('Commits', 'commits'),
    buildMetric('Autores', 'authors'),
    buildMetric('Período', 'period'),
  );

  const toolbar = document.createElement('div');
  toolbar.className = 'git-history-page-toolbar';
  const referenceLabel = document.createElement('label');
  referenceLabel.className = 'git-history-page-reference';
  mountIcon(referenceLabel, TagIcon, 'git-history-page-control-icon');
  const reference = document.createElement('select');
  reference.dataset.historyControl = 'reference';
  reference.setAttribute('aria-label', 'Referência do histórico');
  reference.addEventListener('change', () => {
    const state = stateBySection.get(section);
    if (!state) return;
    state.reference = reference.value;
    void loadHistory(section, 1, true);
  });
  referenceLabel.append(reference);

  const searchLabel = document.createElement('label');
  searchLabel.className = 'git-history-page-search';
  mountIcon(searchLabel, MagnifyingGlassIcon, 'git-history-page-control-icon');
  const search = document.createElement('input');
  search.type = 'search';
  search.placeholder = 'Buscar hash, mensagem ou autor nesta página…';
  search.dataset.historyControl = 'search';
  search.setAttribute('aria-label', 'Buscar commits nesta página');
  search.addEventListener('input', () => {
    const state = stateBySection.get(section);
    if (!state) return;
    state.search = search.value;
    renderList(section);
  });
  searchLabel.append(search);

  const authorLabel = document.createElement('label');
  authorLabel.className = 'git-history-page-author';
  mountIcon(authorLabel, UserCircleIcon, 'git-history-page-control-icon');
  const author = document.createElement('select');
  author.dataset.historyControl = 'author';
  author.setAttribute('aria-label', 'Filtrar por autor');
  author.addEventListener('change', () => {
    const state = stateBySection.get(section);
    if (!state) return;
    state.author = author.value;
    renderList(section);
  });
  authorLabel.append(author);

  const kind = document.createElement('select');
  kind.dataset.historyControl = 'kind';
  kind.setAttribute('aria-label', 'Filtrar por tipo de commit');
  [
    ['all', 'Todos os commits'],
    ['regular', 'Commits comuns'],
    ['merge', 'Somente merges'],
  ].forEach(([value, label]) => {
    const option = document.createElement('option');
    option.value = value ?? '';
    option.textContent = label ?? '';
    kind.append(option);
  });
  kind.addEventListener('change', () => {
    const state = stateBySection.get(section);
    if (!state) return;
    state.kind = kind.value as HistoryCommitKind;
    renderList(section);
  });
  const refresh = document.createElement('button');
  refresh.type = 'button';
  refresh.className = 'secondary-button git-history-page-refresh';
  mountIcon(refresh, ArrowPathIcon, 'git-history-page-refresh-icon');
  const refreshText = document.createElement('span');
  refreshText.textContent = 'Atualizar';
  refresh.append(refreshText);
  refresh.addEventListener('click', () => {
    const state = stateBySection.get(section);
    if (state) void loadHistory(section, state.page, false);
  });
  toolbar.append(referenceLabel, searchLabel, authorLabel, kind, refresh);

  const layout = document.createElement('section');
  layout.className = 'git-history-page-layout';
  const history = document.createElement('div');
  history.className = 'git-history-page-timeline';
  const listHeader = document.createElement('header');
  const listTitle = document.createElement('div');
  const listHeading = document.createElement('h3');
  listHeading.textContent = 'Commits';
  const filterCount = document.createElement('span');
  filterCount.className = 'git-history-page-filter-count';
  filterCount.textContent = 'Carregando…';
  listTitle.append(listHeading, filterCount);
  const keyboardHint = document.createElement('small');
  keyboardHint.textContent = '↑ ↓ para navegar · Esc para fechar';
  listHeader.append(listTitle, keyboardHint);

  const list = document.createElement('div');
  list.className = 'git-history-page-list';
  list.tabIndex = 0;
  list.addEventListener('keydown', (event) => {
    const state = stateBySection.get(section);
    if (!state) return;
    if (event.key === 'Escape') {
      closeDetail(section);
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const commits = filteredCommits(state);
    if (commits.length === 0) return;
    const index = commits.findIndex((commit) => commit.hash === state.selectedHash);
    const nextIndex = event.key === 'ArrowDown'
      ? Math.min(commits.length - 1, index < 0 ? 0 : index + 1)
      : Math.max(0, index < 0 ? commits.length - 1 : index - 1);
    const next = commits[nextIndex];
    if (next) void selectCommit(section, next.hash);
  });
  history.append(listHeader, list, buildPagination(section));

  const detail = document.createElement('aside');
  detail.className = 'git-history-page-detail';
  detail.setAttribute('aria-live', 'polite');
  applyHistoryListWidth(layout, readHistoryListWidth());
  layout.append(history, buildHistoryResizer(layout), detail);
  section.append(toolbar, metrics, layout);

  const state: HistoryPageState = {
    projectId,
    reference: 'HEAD',
    resolvedReference: '',
    branches: [],
    commits: [],
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 0,
    search: '',
    author: '',
    kind: 'all',
    selectedHash: '',
    copiedHash: '',
    historyRequest: undefined,
    detailRequest: undefined,
  };
  stateBySection.set(section, state);
  setHistoryLoading(section);

  void (async () => {
    try {
      const workspace = await requestJson<GitWorkspaceResponse>(
        `/api/projects/${encodeURIComponent(projectId)}/git/workspace`,
      );
      state.branches = workspace.workspace.branches;
      state.reference = currentReference(state.branches);
      renderReferenceOptions(section);
      await loadHistory(section, 1, true);
    } catch (error) {
      const list = section.querySelector<HTMLElement>('.git-history-page-list');
      list?.replaceChildren();
      const message = document.createElement('div');
      message.className = 'git-history-page-empty is-error';
      const title = document.createElement('strong');
      title.textContent = 'Não foi possível abrir o histórico';
      const description = document.createElement('p');
      description.textContent = error instanceof Error ? error.message : 'Falha ao carregar branches.';
      message.append(title, description);
      list?.append(message);
    }
  })();
}

function enhanceHistory(section: HTMLElement): void {
  if (section.dataset.historyPageEnhanced === 'true') return;
  const projectId = projectIdFromLocation();
  if (!projectId) return;
  section.dataset.historyPageEnhanced = 'true';
  buildPage(section, projectId);
}

function scan(root: ParentNode = document): void {
  if (root instanceof HTMLElement && root.matches('.git-history-list')) {
    const section = root.closest<HTMLElement>('.git-tab-page');
    if (section) enhanceHistory(section);
  }
  root.querySelectorAll<HTMLElement>('.git-history-list').forEach((list) => {
    const section = list.closest<HTMLElement>('.git-tab-page');
    if (section) enhanceHistory(section);
  });
}

export function installGitHistoryPageEnhancer(): void {
  if (typeof document === 'undefined') return;
  scan(document);
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof HTMLElement) scan(node);
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}
