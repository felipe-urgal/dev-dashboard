import { ArrowRightIcon, FunnelIcon, MagnifyingGlassIcon } from '@heroicons/vue/24/outline';

import { classifyGitStatus, matchesCommitFile } from './classify';
import { mountIcon } from './dom-helpers';
import { findTab } from './tabs';
import type { CommitFileFilter, CommitFileKind } from './types';

interface FileRowState {
  row: HTMLElement;
  text: string;
  kinds: CommitFileKind[];
}

export function enhanceFiles(section: HTMLElement): { counts: Record<CommitFileKind, number>; refresh: () => void } {
  const card = section.querySelector<HTMLElement>('.files-card');
  const list = card?.querySelector<HTMLElement>('.git-file-list-modern');
  const rows = Array.from(list?.querySelectorAll<HTMLElement>(':scope > li') ?? []);
  const counts: Record<CommitFileKind, number> = { staged: 0, modified: 0, untracked: 0 };
  let activeFilter: CommitFileFilter = 'all';
  let search = '';

  const states: FileRowState[] = rows.map((row) => {
    const status = row.querySelector('small')?.textContent ?? '';
    const label = row.querySelector('[class*="status"], span')?.textContent ?? '';
    const kinds = classifyGitStatus(status, label);
    kinds.forEach((kind) => { counts[kind] += 1; });
    row.dataset.commitKinds = kinds.join(' ');

    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'git-commit-file-diff';
    action.title = 'Abrir a área de diff';
    mountIcon(action, ArrowRightIcon, 'git-commit-row-icon');
    const actionText = document.createElement('span');
    actionText.textContent = 'Diff';
    action.append(actionText);
    action.addEventListener('click', () => findTab('Diff')?.click());
    row.append(action);

    return { row, text: row.textContent ?? '', kinds };
  });

  const empty = document.createElement('p');
  empty.className = 'git-commit-filter-empty';
  empty.hidden = true;
  empty.textContent = 'Nenhum arquivo corresponde a este filtro.';
  list?.after(empty);

  const refresh = (): void => {
    let visible = 0;
    for (const state of states) {
      const matches = matchesCommitFile(state.text, state.kinds, activeFilter, search);
      state.row.hidden = !matches;
      if (matches) visible += 1;
    }
    empty.hidden = visible > 0 || rows.length === 0;
  };

  if (card) {
    const toolbar = document.createElement('div');
    toolbar.className = 'git-commit-file-toolbar';

    const filters = document.createElement('div');
    filters.className = 'git-commit-file-filters';
    filters.setAttribute('aria-label', 'Filtrar arquivos do commit');
    mountIcon(filters, FunnelIcon, 'git-commit-toolbar-icon');

    const definitions: Array<[CommitFileFilter, string, number]> = [
      ['all', 'Todos', rows.length],
      ['staged', 'Staged', counts.staged],
      ['modified', 'Modificados', counts.modified],
      ['untracked', 'Novos', counts.untracked],
    ];
    definitions.forEach(([value, label, count], index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = index === 0 ? 'active' : '';
      button.dataset.filter = value;
      button.innerHTML = `<span>${label}</span><b>${count}</b>`;
      button.addEventListener('click', () => {
        activeFilter = value;
        filters.querySelectorAll('button').forEach((candidate) => {
          candidate.classList.toggle('active', candidate === button);
        });
        refresh();
      });
      filters.append(button);
    });

    const searchLabel = document.createElement('label');
    searchLabel.className = 'git-commit-file-search';
    mountIcon(searchLabel, MagnifyingGlassIcon, 'git-commit-search-icon');
    const input = document.createElement('input');
    input.type = 'search';
    input.placeholder = 'Buscar arquivo alterado…';
    input.setAttribute('aria-label', 'Buscar arquivo alterado');
    input.addEventListener('input', () => {
      search = input.value;
      refresh();
    });
    searchLabel.append(input);

    toolbar.append(filters, searchLabel);
    card.querySelector('header')?.after(toolbar);
  }

  refresh();
  return { counts, refresh };
}
