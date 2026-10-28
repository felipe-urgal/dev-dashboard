import type { GitDiffFile, GitDiffScope } from '@dev-dashboard/contracts';

const REVIEW_STORAGE_PREFIX = 'dev-dashboard-git-diff-reviewed';

/** Assinatura estável do conjunto de arquivos (muda quando o diff muda). */
export function snapshotSignature(files: readonly GitDiffFile[]): string {
  const serialized = [...files]
    .sort((left, right) => left.path.localeCompare(right.path))
    .map((file) =>
      [
        file.path,
        file.previousPath ?? '',
        file.status,
        file.additions,
        file.deletions,
        file.binary ? 1 : 0,
      ].join(':'),
    )
    .join('\n');

  let hash = 2_166_136_261;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(36);
}

export function reviewStorageKey(
  projectId: string,
  scope: GitDiffScope,
  files: readonly GitDiffFile[],
): string {
  return [
    REVIEW_STORAGE_PREFIX,
    encodeURIComponent(projectId),
    scope,
    snapshotSignature(files),
  ].join(':');
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function sessionStorageOrNull(): StorageLike | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * Arquivos revisados ficam só na sessão: a chave muda quando o diff muda,
 * então uma revisão antiga nunca vale para um diff diferente.
 */
export function readReviewedPaths(
  key: string,
  storage: StorageLike | null = sessionStorageOrNull(),
): Set<string> {
  try {
    const stored = storage?.getItem(key);
    if (!stored) return new Set();
    const parsed = JSON.parse(stored) as unknown;
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((value): value is string => typeof value === 'string')
        : [],
    );
  } catch {
    return new Set();
  }
}

export function persistReviewedPaths(
  key: string,
  reviewed: string[],
  storage: StorageLike | null = sessionStorageOrNull(),
): void {
  if (!key) return;
  try {
    if (reviewed.length === 0) storage?.removeItem(key);
    else storage?.setItem(key, JSON.stringify(reviewed));
  } catch {
    // Estado de revisão é apenas conveniência da sessão.
  }
}
