import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  MagnifyingGlassIcon,
} from '@heroicons/vue/24/outline';

import { closeCommitDetail } from './git-summary-history/detail';
import { currentBranchFromSection, mountIcon, projectIdFromLocation, requestJson } from './git-summary-history/dom-helpers';
import { renderHistoryList, renderPagination, setHistoryLoading } from './git-summary-history/list';
import { stateBySection } from './git-summary-history/state';
import type { GitCommitHistoryResponse, SummaryState } from './git-summary-history/types';

async function loadHistoryPage(
  section: HTMLElement,
  requestedPage: number,
  resetView = false,
): Promise<void> {
  const state = stateBySection.get(section);
  if (!state) return;
  state.historyRequest?.abort();
  const controller = new AbortController();
  state.historyRequest = controller;

  if (resetView) {
    state.search = '';
    const input = section.querySelector<HTMLInputElement>('.git-summary-history-search input');
    if (input) input.value = '';
    closeCommitDetail(section);
  }
  setHistoryLoading(section);

  try {
    const query = new URLSearchParams({
      page: String(Math.max(1, requestedPage)),
      pageSize: '10',
    });
    const response = await requestJson<GitCommitHistoryResponse>(
      `/api/projects/${encodeURIComponent(state.projectId)}/git/commits?${query}`,
      controller.signal,
    );
    if (controller.signal.aborted) return;
    state.branch = response.history.branch;
    state.commits = response.history.commits;
    state.page = response.history.page;
    state.pageSize = response.history.pageSize;
    state.total = response.history.total;
    state.totalPages = response.history.totalPages;
    renderHistoryList(section);
  } catch (error) {
    if (controller.signal.aborted) return;
    const list = section.querySelector<HTMLElement>('.git-summary-history-list');
    const count = section.querySelector<HTMLElement>('.git-summary-history-count');
    list?.replaceChildren();
    const message = document.createElement('p');
    message.className = 'git-summary-history-empty is-error';
    message.textContent = error instanceof Error
      ? error.message
      : 'Não foi possível carregar o histórico.';
    list?.append(message);
    if (count) count.textContent = 'Histórico indisponível';
  } finally {
    if (state.historyRequest === controller) state.historyRequest = undefined;
    renderPagination(section);
  }
}

function buildPagination(section: HTMLElement): HTMLElement {
  const footer = document.createElement('footer');
  footer.className = 'git-summary-history-pagination';

  const previous = document.createElement('button');
  previous.type = 'button';
  previous.dataset.historyPage = 'previous';
  previous.setAttribute('aria-label', 'Página anterior do histórico');
  mountIcon(previous, ChevronLeftIcon, 'git-summary-pagination-icon');
  const previousText = document.createElement('span');
  previousText.textContent = 'Anterior';
  previous.append(previousText);
  previous.addEventListener('click', () => {
    const state = stateBySection.get(section);
    if (state && state.page > 1) void loadHistoryPage(section, state.page - 1, true);
  });

  const label = document.createElement('span');
  label.className = 'git-summary-history-page-label';
  label.textContent = 'Nenhuma página';

  const next = document.createElement('button');
  next.type = 'button';
  next.dataset.historyPage = 'next';
  next.setAttribute('aria-label', 'Próxima página do histórico');
  const nextText = document.createElement('span');
  nextText.textContent = 'Próxima';
  next.append(nextText);
  mountIcon(next, ChevronRightIcon, 'git-summary-pagination-icon');
  next.addEventListener('click', () => {
    const state = stateBySection.get(section);
    if (state && state.page < state.totalPages) {
      void loadHistoryPage(section, state.page + 1, true);
    }
  });

  footer.append(previous, label, next);
  return footer;
}

function watchCurrentBranch(section: HTMLElement): MutationObserver | undefined {
  const target = section.querySelector<HTMLElement>('.git-status-grid article:first-child strong');
  if (!target) return undefined;
  const observer = new MutationObserver(() => {
    const state = stateBySection.get(section);
    if (!state || state.historyRequest) return;
    const branch = currentBranchFromSection(section);
    if (branch && branch !== state.branch) {
      void loadHistoryPage(section, 1, true);
    }
  });
  observer.observe(target, { childList: true, characterData: true, subtree: true });
  return observer;
}

function buildHistory(section: HTMLElement, projectId: string): void {
  const shell = document.createElement('section');
  shell.className = 'git-summary-history-shell';

  const history = document.createElement('div');
  history.className = 'git-summary-history-pane';
  const header = document.createElement('header');
  header.className = 'git-summary-history-header';
  const title = document.createElement('div');
  title.className = 'git-summary-history-title';
  mountIcon(title, ClockIcon, 'git-summary-history-icon');
  const titleCopy = document.createElement('div');
  const heading = document.createElement('h2');
  heading.textContent = 'Histórico da branch atual';
  const count = document.createElement('span');
  count.className = 'git-summary-history-count';
  count.textContent = 'Carregando…';
  titleCopy.append(heading, count);
  title.append(titleCopy);

  const search = document.createElement('label');
  search.className = 'git-summary-history-search';
  mountIcon(search, MagnifyingGlassIcon, 'git-summary-search-icon');
  const input = document.createElement('input');
  input.type = 'search';
  input.placeholder = 'Buscar nesta página…';
  input.setAttribute('aria-label', 'Buscar nos commits desta página');
  input.addEventListener('input', () => {
    const state = stateBySection.get(section);
    if (!state) return;
    state.search = input.value;
    renderHistoryList(section);
  });
  search.append(input);
  header.append(title, search);

  const list = document.createElement('div');
  list.className = 'git-summary-history-list';
  const loading = document.createElement('p');
  loading.className = 'git-summary-history-empty';
  loading.textContent = 'Carregando histórico…';
  list.append(loading);
  history.append(header, list, buildPagination(section));

  const detail = document.createElement('aside');
  detail.className = 'git-summary-commit-detail';
  detail.setAttribute('aria-live', 'polite');
  shell.append(history, detail);
  section.append(shell);

  const state: SummaryState = {
    projectId,
    branch: currentBranchFromSection(section),
    commits: [],
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 0,
    selectedHash: '',
    search: '',
    request: undefined,
    historyRequest: undefined,
    branchObserver: undefined,
  };
  stateBySection.set(section, state);
  state.branchObserver = watchCurrentBranch(section);
  void loadHistoryPage(section, 1);
}

function enhanceSummary(section: HTMLElement): void {
  if (section.dataset.historyEnhanced === 'true') return;
  const projectId = projectIdFromLocation();
  if (!projectId) return;

  const status = section.querySelector('.git-status-grid');
  const branch = section.querySelector('.git-branch-toolbar');
  if (!status || !branch) return;

  section.dataset.historyEnhanced = 'true';
  section.classList.add('git-summary-history-page');
  Array.from(section.children).forEach((child) => {
    if (child !== status && child !== branch) child.remove();
  });
  buildHistory(section, projectId);
}

function scan(root: ParentNode = document): void {
  if (root instanceof HTMLElement && root.matches('.git-summary-page')) {
    enhanceSummary(root);
  }
  root.querySelectorAll<HTMLElement>('.git-summary-page').forEach(enhanceSummary);
}

export function installGitSummaryHistoryEnhancer(): void {
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
