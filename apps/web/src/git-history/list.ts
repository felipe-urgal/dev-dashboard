import { filterHistoryCommits } from './filters';
import { dayKey, formatDate, formatDay, relativeDate } from './format';
import { mountIcon } from './dom-helpers';
import { selectCommit } from './detail';
import { stateBySection } from './state';
import type { GitHistoryCommit, HistoryPageState } from './types';

import {
  ArrowPathIcon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
} from '@heroicons/vue/24/outline';

export function commitRow(section: HTMLElement, commit: GitHistoryCommit): HTMLButtonElement {
  const state = stateBySection.get(section)!;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'git-history-page-row';
  button.dataset.commitHash = commit.hash;
  button.classList.toggle('active', state.selectedHash === commit.hash);

  const rail = document.createElement('span');
  rail.className = 'git-history-page-rail';
  rail.append(document.createElement('i'));

  const copy = document.createElement('span');
  copy.className = 'git-history-page-row-copy';
  const top = document.createElement('span');
  top.className = 'git-history-page-row-top';
  const hash = document.createElement('code');
  hash.textContent = commit.shortHash;
  const time = document.createElement('time');
  time.dateTime = commit.authoredAt;
  time.textContent = relativeDate(commit.authoredAt);
  time.title = formatDate(commit.authoredAt);
  top.append(hash, time);

  const subject = document.createElement('strong');
  subject.textContent = commit.subject;
  const metadata = document.createElement('span');
  metadata.className = 'git-history-page-row-meta';
  const author = document.createElement('small');
  author.textContent = commit.authorName;
  author.title = commit.authorEmail;
  metadata.append(author);
  if (commit.parentCount >= 2) {
    const merge = document.createElement('em');
    merge.textContent = 'Merge';
    metadata.append(merge);
  }
  copy.append(top, subject, metadata);

  mountIcon(button, ChevronRightIcon, 'git-history-page-chevron');
  button.prepend(rail, copy);
  button.addEventListener('click', () => void selectCommit(section, commit.hash));
  return button;
}

export function filteredCommits(state: HistoryPageState): GitHistoryCommit[] {
  return filterHistoryCommits(state.commits, state.search, state.author, state.kind);
}

export function renderList(section: HTMLElement): void {
  const state = stateBySection.get(section);
  const list = section.querySelector<HTMLElement>('.git-history-page-list');
  const count = section.querySelector<HTMLElement>('.git-history-page-filter-count');
  if (!state || !list) return;
  const commits = filteredCommits(state);

  list.replaceChildren();
  let previousDay = '';
  commits.forEach((commit) => {
    const currentDay = dayKey(commit.authoredAt);
    if (currentDay !== previousDay) {
      const separator = document.createElement('div');
      separator.className = 'git-history-page-day';
      separator.textContent = formatDay(commit.authoredAt);
      list.append(separator);
      previousDay = currentDay;
    }
    list.append(commitRow(section, commit));
  });

  if (count) {
    count.textContent = commits.length === state.commits.length
      ? `${commits.length} commits nesta página`
      : `${commits.length} de ${state.commits.length} commits nesta página`;
  }

  if (commits.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'git-history-page-empty';
    mountIcon(empty, MagnifyingGlassIcon, 'git-history-page-empty-icon');
    const title = document.createElement('strong');
    title.textContent = state.commits.length === 0
      ? 'Nenhum commit encontrado'
      : 'Nenhum commit corresponde aos filtros';
    const description = document.createElement('p');
    description.textContent = state.commits.length === 0
      ? 'Esta referência ainda não possui commits.'
      : 'Ajuste a busca, o autor ou o tipo de commit.';
    empty.append(title, description);
    list.append(empty);
  }

  list.querySelector<HTMLButtonElement>('.git-history-page-row')?.setAttribute('tabindex', '0');
  renderPagination(section);
}

export function setHistoryLoading(section: HTMLElement): void {
  const list = section.querySelector<HTMLElement>('.git-history-page-list');
  if (!list) return;
  list.replaceChildren();
  const loading = document.createElement('div');
  loading.className = 'git-history-page-loading';
  mountIcon(loading, ArrowPathIcon, 'git-history-page-loading-icon');
  const copy = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = 'Carregando histórico';
  const description = document.createElement('span');
  description.textContent = 'Consultando commits e autores da referência…';
  copy.append(title, description);
  loading.append(copy);
  list.append(loading);
}

export function renderPagination(section: HTMLElement): void {
  const state = stateBySection.get(section);
  if (!state) return;
  const previous = section.querySelector<HTMLButtonElement>('[data-history-page="previous"]');
  const next = section.querySelector<HTMLButtonElement>('[data-history-page="next"]');
  const label = section.querySelector<HTMLElement>('.git-history-page-pagination-label');
  if (previous) previous.disabled = state.page <= 1 || state.totalPages <= 1;
  if (next) next.disabled = state.totalPages <= 1 || state.page >= state.totalPages;
  if (label) label.textContent = state.totalPages > 0
    ? `Página ${state.page} de ${state.totalPages}`
    : 'Nenhuma página';
}

export function closeDetail(section: HTMLElement): void {
  const state = stateBySection.get(section);
  if (!state) return;
  state.detailRequest?.abort();
  state.detailRequest = undefined;
  state.selectedHash = '';
  state.copiedHash = '';
  section.querySelector('.git-history-page-layout')?.classList.remove('is-inspecting');
  section.querySelector('.git-history-page-detail')?.replaceChildren();
  renderList(section);
}
