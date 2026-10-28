import type { GitDiffFile, GitFileStatus } from '@dev-dashboard/contracts';

export type DiffStatusFilter = 'all' | GitFileStatus;

export interface DiffListItem {
  file: GitDiffFile;
  viewed: boolean;
}

export interface DiffListGroup {
  /** Pasta com barra final, ou "./" para a raiz do projeto. */
  directory: string;
  items: DiffListItem[];
}

const STATUS_LETTERS: Record<GitFileStatus, string> = {
  modified: 'M',
  added: 'A',
  deleted: 'D',
  renamed: 'R',
  copied: 'C',
  untracked: 'U',
  conflicted: '!',
  'type-changed': 'T',
};

export function statusLetter(status: GitFileStatus): string {
  return STATUS_LETTERS[status];
}

export function directoryOf(path: string): string {
  const index = path.lastIndexOf('/');
  return index >= 0 ? path.slice(0, index + 1) : '';
}

export function baseNameOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/** Aplica busca por nome e filtro de status, mantendo a ordem original. */
export function filterDiffItems(
  items: DiffListItem[],
  options: { query: string; status: DiffStatusFilter },
): DiffListItem[] {
  const query = options.query.trim().toLowerCase();
  return items.filter(
    ({ file }) =>
      (options.status === 'all' || file.status === options.status) &&
      (!query || file.path.toLowerCase().includes(query)),
  );
}

/** Agrupa por pasta, na ordem em que cada pasta aparece pela primeira vez. */
export function groupDiffItems(items: DiffListItem[]): DiffListGroup[] {
  const groups = new Map<string, DiffListItem[]>();
  for (const item of items) {
    const directory = directoryOf(item.file.path) || './';
    groups.set(directory, [...(groups.get(directory) ?? []), item]);
  }
  return [...groups].map(([directory, grouped]) => ({
    directory,
    items: grouped,
  }));
}

/** Status presentes nos arquivos, na ordem de exibição dos chips. */
export function availableStatuses(files: GitDiffFile[]): GitFileStatus[] {
  const order: GitFileStatus[] = [
    'modified',
    'added',
    'deleted',
    'renamed',
    'copied',
    'untracked',
    'conflicted',
    'type-changed',
  ];
  const present = new Set(files.map((file) => file.status));
  return order.filter((status) => present.has(status));
}

/**
 * Próximo arquivo ainda não revisado depois de `fromPath`; se não houver,
 * volta ao primeiro não revisado. `null` quando tudo foi revisado.
 */
export function nextUnreviewedPath(
  items: { path: string; viewed: boolean }[],
  fromPath: string,
): string | null {
  const start = items.findIndex((item) => item.path === fromPath);
  const after = items.slice(start + 1).find((item) => !item.viewed);
  if (after) return after.path;
  return (
    items.slice(0, Math.max(start, 0)).find((item) => !item.viewed)?.path ??
    null
  );
}

/** Arquivo vizinho (`delta` de -1 ou +1) sem dar a volta nas pontas. */
export function neighborPath(
  paths: string[],
  fromPath: string | null,
  delta: -1 | 1,
): string | null {
  if (paths.length === 0) return null;
  const index = fromPath ? paths.indexOf(fromPath) : -1;
  if (index === -1) return delta === 1 ? paths[0]! : paths.at(-1)!;
  return paths[index + delta] ?? paths[index]!;
}
