import { ChevronRightIcon } from '@heroicons/vue/24/outline';

import { selectCommit } from './detail';
import { mountIcon } from './dom-helpers';
import { formatDate, relativeDate } from './format';
import { stateBySection } from './state';
import type { GitCommitSummary } from './types';

function commitListItem(
  section: HTMLElement,
  commit: GitCommitSummary,
): HTMLButtonElement {
  const state = stateBySection.get(section)!;
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
  button.addEventListener('click', () => {
    void selectCommit(section, commit.hash);
  });
  return button;
}

export function renderPagination(section: HTMLElement): void {
  const state = stateBySection.get(section);
  if (!state) return;
  const previous = section.querySelector<HTMLButtonElement>(
    '[data-history-page="previous"]',
  );
  const next = section.querySelector<HTMLButtonElement>(
    '[data-history-page="next"]',
  );
  const label = section.querySelector<HTMLElement>(
    '.git-summary-history-page-label',
  );
  if (previous) previous.disabled = state.page <= 1 || state.totalPages <= 1;
  if (next)
    next.disabled = state.totalPages <= 1 || state.page >= state.totalPages;
  if (label) {
    label.textContent =
      state.totalPages > 0
        ? `Página ${state.page} de ${state.totalPages}`
        : 'Nenhuma página';
  }
}

export function renderHistoryList(section: HTMLElement): void {
  const state = stateBySection.get(section);
  const list = section.querySelector<HTMLElement>('.git-summary-history-list');
  const count = section.querySelector<HTMLElement>(
    '.git-summary-history-count',
  );
  if (!state || !list) return;

  const query = state.search.trim().toLocaleLowerCase('pt-BR');
  const commits = state.commits.filter((commit) => {
    if (!query) return true;
    return [
      commit.shortHash,
      commit.subject,
      commit.authorName,
      commit.authorEmail,
    ].some((value) => value.toLocaleLowerCase('pt-BR').includes(query));
  });

  list.replaceChildren();
  commits.forEach((commit) => list.append(commitListItem(section, commit)));

  if (count) {
    if (query) {
      count.textContent = `${commits.length} resultado${commits.length === 1 ? '' : 's'} nesta página · ${state.total} commits · ${state.branch}`;
    } else if (state.total > 0) {
      const start = (state.page - 1) * state.pageSize + 1;
      const end = start + state.commits.length - 1;
      count.textContent = `${start}–${end} de ${state.total} commits · ${state.branch}`;
    } else {
      count.textContent = `0 commits · ${state.branch || 'branch atual'}`;
    }
  }

  if (commits.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'git-summary-history-empty';
    empty.textContent =
      state.commits.length === 0
        ? 'A branch atual ainda não possui commits.'
        : 'Nenhum commit desta página corresponde à busca.';
    list.append(empty);
  }
  section
    .querySelector('.git-summary-history-shell')
    ?.classList.toggle('is-empty', state.commits.length === 0);
  renderPagination(section);
}

export function setHistoryLoading(section: HTMLElement): void {
  const list = section.querySelector<HTMLElement>('.git-summary-history-list');
  const count = section.querySelector<HTMLElement>(
    '.git-summary-history-count',
  );
  if (!list) return;
  list.replaceChildren();
  const loading = document.createElement('p');
  loading.className = 'git-summary-history-empty';
  loading.textContent = 'Carregando commits da branch atual…';
  list.append(loading);
  if (count) count.textContent = 'Atualizando histórico…';
}
