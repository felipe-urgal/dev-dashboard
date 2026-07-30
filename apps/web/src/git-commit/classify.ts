import type { CommitFileFilter, CommitFileKind } from './types';

export function classifyGitStatus(status: string, label = ''): CommitFileKind[] {
  const normalized = status.trim();
  const [index = '.', worktree = '.'] = normalized.split('/');
  const kinds: CommitFileKind[] = [];

  if (label.toLocaleLowerCase('pt-BR').includes('não rastreado') || index === '?' || worktree === '?') {
    kinds.push('untracked');
    return kinds;
  }

  if (index !== '.' && index !== ' ') kinds.push('staged');
  if (worktree !== '.' && worktree !== ' ') kinds.push('modified');
  return kinds;
}

export function matchesCommitFile(
  text: string,
  kinds: readonly CommitFileKind[],
  filter: CommitFileFilter,
  search: string,
): boolean {
  const matchesFilter = filter === 'all' || kinds.includes(filter);
  const normalizedSearch = search.trim().toLocaleLowerCase('pt-BR');
  return matchesFilter && (
    normalizedSearch.length === 0 || text.toLocaleLowerCase('pt-BR').includes(normalizedSearch)
  );
}
