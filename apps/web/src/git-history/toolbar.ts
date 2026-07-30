import { uniqueHistoryAuthors } from './filters';
import { relativeDate } from './format';
import { stateBySection } from './state';
import type { GitBranch } from './types';

export function renderReferenceOptions(section: HTMLElement): void {
  const state = stateBySection.get(section);
  const select = section.querySelector<HTMLSelectElement>('[data-history-control="reference"]');
  if (!state || !select) return;

  select.replaceChildren();
  const groups: Array<{ label: string; branches: GitBranch[] }> = [
    {
      label: 'Branches locais',
      branches: state.branches.filter((branch) => branch.kind === 'local'),
    },
    {
      label: 'Origin',
      branches: state.branches.filter((branch) => branch.kind === 'remote' && branch.remote === 'origin'),
    },
    {
      label: 'Upstream',
      branches: state.branches.filter((branch) => branch.kind === 'remote' && branch.remote === 'upstream'),
    },
    {
      label: 'Outros remotos',
      branches: state.branches.filter((branch) =>
        branch.kind === 'remote' && branch.remote !== 'origin' && branch.remote !== 'upstream'),
    },
  ];

  groups.forEach((group) => {
    if (group.branches.length === 0) return;
    const optgroup = document.createElement('optgroup');
    optgroup.label = group.label;
    group.branches.forEach((branch) => {
      const option = document.createElement('option');
      option.value = branch.name;
      option.textContent = branch.current ? `✓ ${branch.name}` : branch.name;
      optgroup.append(option);
    });
    select.append(optgroup);
  });

  if (![...select.options].some((option) => option.value === state.reference)) {
    const option = document.createElement('option');
    option.value = state.reference;
    option.textContent = state.reference;
    select.prepend(option);
  }
  select.value = state.reference;
}

export function renderAuthorOptions(section: HTMLElement): void {
  const state = stateBySection.get(section);
  const select = section.querySelector<HTMLSelectElement>('[data-history-control="author"]');
  if (!state || !select) return;
  const previous = state.author;
  select.replaceChildren();
  const all = document.createElement('option');
  all.value = '';
  all.textContent = 'Todos os autores';
  select.append(all);
  uniqueHistoryAuthors(state.commits).forEach((author) => {
    const option = document.createElement('option');
    option.value = author.email;
    option.textContent = author.name;
    option.title = author.email;
    select.append(option);
  });
  state.author = [...select.options].some((option) => option.value === previous) ? previous : '';
  select.value = state.author;
}

export function renderMetrics(section: HTMLElement): void {
  const state = stateBySection.get(section);
  if (!state) return;
  const mergeCount = state.commits.filter((commit) => commit.parentCount >= 2).length;
  const authorCount = uniqueHistoryAuthors(state.commits).length;
  const first = state.commits[0];
  const last = state.commits.at(-1);
  const range = state.total > 0
    ? `${((state.page - 1) * state.pageSize) + 1}–${((state.page - 1) * state.pageSize) + state.commits.length}`
    : '0';

  const values: Record<string, { value: string; detail: string }> = {
    reference: {
      value: state.resolvedReference || state.reference,
      detail: 'referência consultada',
    },
    commits: {
      value: String(state.total),
      detail: `${range} exibidos nesta página`,
    },
    authors: {
      value: String(authorCount),
      detail: `${mergeCount} merge${mergeCount === 1 ? '' : 's'} nesta página`,
    },
    period: {
      value: first && last ? `${relativeDate(first.authoredAt)} → ${relativeDate(last.authoredAt)}` : 'Sem período',
      detail: 'intervalo da página atual',
    },
  };

  Object.entries(values).forEach(([key, content]) => {
    const card = section.querySelector<HTMLElement>(`[data-history-metric="${key}"]`);
    const strong = card?.querySelector('strong');
    const small = card?.querySelector('small');
    if (strong) strong.textContent = content.value;
    if (small) small.textContent = content.detail;
  });
}

export function resetFilters(section: HTMLElement): void {
  const state = stateBySection.get(section);
  if (!state) return;
  state.search = '';
  state.author = '';
  state.kind = 'all';
  const search = section.querySelector<HTMLInputElement>('[data-history-control="search"]');
  const author = section.querySelector<HTMLSelectElement>('[data-history-control="author"]');
  const kind = section.querySelector<HTMLSelectElement>('[data-history-control="kind"]');
  if (search) search.value = '';
  if (author) author.value = '';
  if (kind) kind.value = 'all';
}
