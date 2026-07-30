import type { GitHistoryCommit, HistoryCommitKind } from './types';

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase('pt-BR');
}

export function filterHistoryCommits(
  commits: readonly GitHistoryCommit[],
  search: string,
  author: string,
  kind: HistoryCommitKind,
): GitHistoryCommit[] {
  const query = normalized(search);
  return commits.filter((commit) => {
    if (author && commit.authorEmail !== author) return false;
    if (kind === 'merge' && commit.parentCount < 2) return false;
    if (kind === 'regular' && commit.parentCount >= 2) return false;
    if (!query) return true;
    return [commit.hash, commit.shortHash, commit.subject, commit.authorName, commit.authorEmail]
      .some((value) => normalized(value).includes(query));
  });
}

export function uniqueHistoryAuthors(
  commits: readonly GitHistoryCommit[],
): Array<{ email: string; name: string }> {
  const authors = new Map<string, string>();
  commits.forEach((commit) => {
    if (!authors.has(commit.authorEmail)) authors.set(commit.authorEmail, commit.authorName);
  });
  return [...authors.entries()]
    .map(([email, name]) => ({ email, name }))
    .sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'));
}
