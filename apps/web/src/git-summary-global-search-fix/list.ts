import { ChevronRightIcon } from '@heroicons/vue/24/outline';

import { selectResult } from './detail';
import { mountIcon } from './dom-helpers';
import { formatDate, relativeDate } from './format';
import { setPagination } from './pagination';
import { stateFor } from './state';
import type { CommitSummary } from './types';

function resultRow(
  section: HTMLElement,
  commit: CommitSummary,
): HTMLButtonElement {
  const state = stateFor(section);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'git-history-commit-row';
  button.dataset.commitHash = commit.hash;
  button.classList.toggle('active', state.selectedHash === commit.hash);

  const rail = document.createElement('span');
  rail.className = 'git-history-commit-rail';
  rail.append(document.createElement('i'));

  const content = document.createElement('span');
  content.className = 'git-history-commit-copy';
  const top = document.createElement('span');
  top.className = 'git-history-commit-topline';
  const hash = document.createElement('code');
  hash.textContent = commit.shortHash;
  const date = document.createElement('time');
  date.dateTime = commit.authoredAt;
  date.textContent = relativeDate(commit.authoredAt);
  date.title = formatDate(commit.authoredAt);
  top.append(hash, date);
  const subject = document.createElement('strong');
  subject.textContent = commit.subject;
  const author = document.createElement('small');
  author.textContent = commit.authorName;
  content.append(top, subject, author);

  mountIcon(button, ChevronRightIcon, 'git-history-row-chevron');
  button.prepend(rail, content);
  button.addEventListener('click', () => void selectResult(section, commit));
  return button;
}

export function renderResults(section: HTMLElement): void {
  const state = stateFor(section);
  const list = section.querySelector<HTMLElement>('.git-summary-history-list');
  const count = section.querySelector<HTMLElement>(
    '.git-summary-history-count',
  );
  if (!list) return;
  list.replaceChildren();
  state.commits.forEach((commit) => list.append(resultRow(section, commit)));

  if (count) {
    if (state.total > 0) {
      const start = (state.page - 1) * state.pageSize + 1;
      const end = start + state.commits.length - 1;
      count.textContent = `${start}–${end} de ${state.total} resultado${state.total === 1 ? '' : 's'} em todo o histórico · ${state.branch}`;
    } else {
      count.textContent = `0 resultados em todo o histórico · ${state.branch || 'branch atual'}`;
    }
  }

  if (state.commits.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'git-summary-history-empty';
    empty.textContent = 'Nenhum commit do histórico corresponde à busca.';
    list.append(empty);
  }
  setPagination(section);
}

export function setSearchLoading(section: HTMLElement): void {
  const list = section.querySelector<HTMLElement>('.git-summary-history-list');
  const count = section.querySelector<HTMLElement>(
    '.git-summary-history-count',
  );
  if (!list) return;
  list.replaceChildren();
  const loading = document.createElement('p');
  loading.className = 'git-summary-history-empty';
  loading.textContent = 'Buscando em todo o histórico da branch…';
  list.append(loading);
  if (count) count.textContent = 'Buscando commits…';
}

export function closeSearchDetail(section: HTMLElement): void {
  const state = stateFor(section);
  state.detailRequest?.abort();
  state.detailRequest = undefined;
  state.selectedHash = '';
  section
    .querySelector('.git-summary-history-shell')
    ?.classList.remove('is-inspecting');
  section.querySelector('.git-summary-commit-detail')?.replaceChildren();
  renderResults(section);
}
