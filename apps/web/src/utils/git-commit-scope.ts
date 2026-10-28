import type {
  GitCommit,
  GitFileChange,
  GitFileStatus,
} from '@dev-dashboard/contracts';

export const COMMIT_MESSAGE_MAX = 500;
/** Convenção do assunto: acima disso o git e o GitHub cortam a linha. */
export const COMMIT_SUBJECT_SOFT_LIMIT = 72;

export const COMMIT_PREFIXES = [
  'feat',
  'fix',
  'docs',
  'refactor',
  'test',
  'chore',
] as const;

export interface CommitScope {
  /** Entram no commit normal (`git commit -a`): tudo que é rastreado. */
  tracked: GitFileChange[];
  /** Ficam de fora do commit normal. */
  untracked: GitFileChange[];
  /** Já estão no índice; só estes entram no amend. */
  staged: GitFileChange[];
  conflicts: GitFileChange[];
}

function isStaged(file: GitFileChange): boolean {
  return file.indexStatus !== '.' && file.indexStatus !== '?';
}

export function deriveCommitScope(
  files: readonly GitFileChange[],
): CommitScope {
  return {
    tracked: files.filter((file) => file.status !== 'untracked'),
    untracked: files.filter((file) => file.status === 'untracked'),
    staged: files.filter(isStaged),
    conflicts: files.filter((file) => file.status === 'conflicted'),
  };
}

export function isFileStaged(file: GitFileChange): boolean {
  return isStaged(file);
}

export function canCreateCommit(options: {
  message: string;
  busy: boolean;
  scope: CommitScope;
}): boolean {
  return (
    options.message.trim().length > 0 &&
    options.message.length <= COMMIT_MESSAGE_MAX &&
    !options.busy &&
    options.scope.conflicts.length === 0 &&
    options.scope.tracked.length > 0
  );
}

/** O amend precisa de algo staged ou de uma mensagem realmente nova. */
export function canAmendCommit(options: {
  message: string;
  busy: boolean;
  scope: CommitScope;
  latest: GitCommit | undefined;
}): boolean {
  const message = options.message.trim();
  const messageChanged = Boolean(
    options.latest?.subject && message && message !== options.latest.subject,
  );
  return (
    !options.busy &&
    options.scope.conflicts.length === 0 &&
    Boolean(options.latest) &&
    (options.scope.staged.length > 0 || messageChanged)
  );
}

export function amendDisabledReason(options: {
  scope: CommitScope;
  latest: GitCommit | undefined;
}): string {
  if (options.scope.conflicts.length > 0) {
    return 'Resolva os conflitos antes de usar amend.';
  }
  if (!options.latest) return 'Não existe commit anterior.';
  return 'Faça stage de alterações ou mude a mensagem para habilitar o amend.';
}

/** Assunto é a primeira linha; o corpo é o que vem depois da linha em branco. */
export function splitCommitMessage(message: string): {
  subject: string;
  body: string;
} {
  const newline = message.indexOf('\n');
  if (newline === -1) return { subject: message, body: '' };
  return {
    subject: message.slice(0, newline),
    body: message.slice(newline + 1).replace(/^\n/, ''),
  };
}

export function joinCommitMessage(subject: string, body: string): string {
  return body.trim() ? `${subject}\n\n${body}` : subject;
}

const PREFIX_PATTERN = new RegExp(
  `^(${COMMIT_PREFIXES.join('|')})(\\([^)]*\\))?:\\s*`,
);

export function activeCommitPrefix(subject: string): string | null {
  return PREFIX_PATTERN.exec(subject)?.[1] ?? null;
}

/** Troca (ou coloca) o prefixo convencional no começo do assunto. */
export function applyCommitPrefix(subject: string, prefix: string): string {
  return `${prefix}: ${subject.replace(PREFIX_PATTERN, '')}`;
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

export function fileStatusLetter(status: GitFileStatus): string {
  return STATUS_LETTERS[status];
}

/** Separa a pasta (com barra final) do nome do arquivo. */
export function splitFilePath(path: string): { dir: string; name: string } {
  const index = path.lastIndexOf('/');
  return { dir: path.slice(0, index + 1), name: path.slice(index + 1) };
}
