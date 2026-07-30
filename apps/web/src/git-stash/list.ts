import { ArchiveBoxIcon, ChevronRightIcon } from '@heroicons/vue/24/outline';

import { selectStash } from './detail';
import { mountIcon } from './dom-helpers';
import { formatDate, relativeDate } from './format';
import { stateBySection } from './state';
import type { GitStashSummary } from './types';

function stashListItem(section: HTMLElement, stash: GitStashSummary): HTMLButtonElement {
  const state = stateBySection.get(section)!;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'git-stash-list-item';
  button.classList.toggle('active', stash.reference === state.selectedReference);

  const top = document.createElement('span');
  top.className = 'git-stash-list-top';
  const reference = document.createElement('code');
  reference.textContent = stash.reference;
  const date = document.createElement('time');
  date.dateTime = stash.createdAt;
  date.textContent = relativeDate(stash.createdAt);
  date.title = formatDate(stash.createdAt);
  top.append(reference, date);

  const message = document.createElement('strong');
  message.textContent = stash.message;
  const branch = document.createElement('small');
  branch.textContent = `Criado em ${stash.branch}`;

  const stats = document.createElement('span');
  stats.className = 'git-stash-list-stats';
  const files = document.createElement('span');
  files.textContent = `${stash.fileCount} arquivo${stash.fileCount === 1 ? '' : 's'}`;
  const additions = document.createElement('span');
  additions.className = 'is-addition';
  additions.textContent = `+${stash.additions}`;
  const deletions = document.createElement('span');
  deletions.className = 'is-deletion';
  deletions.textContent = `−${stash.deletions}`;
  stats.append(files, additions, deletions);
  if (stash.includesUntracked) {
    const untracked = document.createElement('span');
    untracked.className = 'is-untracked';
    untracked.textContent = 'inclui novos';
    stats.append(untracked);
  }

  mountIcon(button, ChevronRightIcon, 'git-stash-row-icon');
  button.prepend(top, message, branch, stats);
  button.addEventListener('click', () => {
    void selectStash(section, stash.reference);
  });
  return button;
}

export function renderList(section: HTMLElement): void {
  const state = stateBySection.get(section);
  const list = section.querySelector<HTMLElement>('.git-stash-list');
  const count = section.querySelector<HTMLElement>('.git-stash-list-count');
  if (!state || !list) return;
  list.replaceChildren();
  if (count) count.textContent = `${state.stashes.length} salvo${state.stashes.length === 1 ? '' : 's'}`;

  if (state.stashes.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'git-stash-empty';
    mountIcon(empty, ArchiveBoxIcon, 'git-stash-empty-icon');
    const title = document.createElement('strong');
    title.textContent = 'Nenhum stash salvo';
    const copy = document.createElement('p');
    copy.textContent = 'Use o formulário acima para guardar trabalho temporário.';
    empty.append(title, copy);
    list.append(empty);
    return;
  }

  state.stashes.forEach((stash) => list.append(stashListItem(section, stash)));
}
