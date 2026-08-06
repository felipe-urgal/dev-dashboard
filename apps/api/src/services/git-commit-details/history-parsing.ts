import {
  FIELD_SEPARATOR,
  HISTORY_REFERENCE_PATTERN,
  RECORD_SEPARATOR,
} from './constants.js';
import { GitCommitDetailsError } from './errors.js';
import { runGit } from './run.js';
import type {
  GitCommitHistoryEntry,
  GitCommitHistoryFilters,
} from './types.js';

export function parseHistory(output: string): GitCommitHistoryEntry[] {
  return output
    .split(RECORD_SEPARATOR)
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [
        hash = '',
        shortHash = '',
        subject = '',
        authorName = '',
        authorEmail = '',
        authoredAt = '',
        parents = '',
      ] = record.split(FIELD_SEPARATOR);
      return {
        hash,
        shortHash,
        subject,
        authorName,
        authorEmail,
        authoredAt,
        parentCount: parents.trim() ? parents.trim().split(/\s+/).length : 0,
      };
    });
}

function normalized(value: string | undefined): string {
  return value?.trim().toLocaleLowerCase('pt-BR') ?? '';
}

export function filterHistory(
  commits: readonly GitCommitHistoryEntry[],
  filters: GitCommitHistoryFilters,
): GitCommitHistoryEntry[] {
  const search = normalized(filters.search);
  const author = normalized(filters.author);
  const kind = filters.kind ?? 'all';

  return commits.filter((commit) => {
    if (author && normalized(commit.authorEmail) !== author) return false;
    if (kind === 'merge' && commit.parentCount < 2) return false;
    if (kind === 'regular' && commit.parentCount >= 2) return false;
    if (!search) return true;
    return [
      commit.hash,
      commit.shortHash,
      commit.subject,
      commit.authorName,
      commit.authorEmail,
    ].some((value) => normalized(value).includes(search));
  });
}

export function hasHistoryFilters(filters: GitCommitHistoryFilters): boolean {
  return Boolean(
    filters.search?.trim() ||
    filters.author?.trim() ||
    (filters.kind && filters.kind !== 'all'),
  );
}

export async function resolveHistoryReference(
  projectPath: string,
  requestedReference?: string,
): Promise<{ label: string; revision: string; exists: boolean }> {
  const currentBranch = (
    await runGit(projectPath, ['branch', '--show-current'])
  ).trim();
  const requested = requestedReference?.trim() ?? '';
  const revision = requested || 'HEAD';
  const label = requested || currentBranch || 'HEAD destacado';

  if (requested && !HISTORY_REFERENCE_PATTERN.test(requested)) {
    throw new GitCommitDetailsError(
      'GIT_COMMIT_INVALID',
      'Referência Git inválida para consultar o histórico.',
    );
  }

  try {
    await runGit(projectPath, [
      'rev-parse',
      '--verify',
      '--quiet',
      '--end-of-options',
      `${revision}^{commit}`,
    ]);
    return { label, revision, exists: true };
  } catch {
    if (!requested) return { label, revision, exists: false };
    throw new GitCommitDetailsError(
      'GIT_COMMIT_NOT_FOUND',
      `A referência Git "${requested}" não foi encontrada.`,
    );
  }
}
