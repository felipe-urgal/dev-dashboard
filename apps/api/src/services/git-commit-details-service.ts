import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { maskSensitiveLogContent } from '@dev-dashboard/process-manager';

const execFileAsync = promisify(execFile);
const FIELD_SEPARATOR = '\u001f';
const RECORD_SEPARATOR = '\u001e';
const PATCH_LIMIT = 320_000;
const FILE_PATCH_LIMIT = 262_144;
const COMMIT_HASH_PATTERN = /^[0-9a-f]{7,40}$/i;
const HISTORY_REFERENCE_PATTERN = /^(?!-)[^\u0000-\u001f\u007f]{1,250}$/;

export type GitCommitFileStatus =
  | 'added'
  | 'modified'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'type-changed';

export type GitCommitHistoryKind = 'all' | 'merge' | 'regular';

export interface GitCommitHistoryFilters {
  search?: string;
  author?: string;
  kind?: GitCommitHistoryKind;
}

export interface GitCommitDetailFile {
  path: string;
  previousPath?: string;
  status: GitCommitFileStatus;
  additions: number;
  deletions: number;
  binary: boolean;
}

export interface GitCommitDetails {
  hash: string;
  shortHash: string;
  subject: string;
  body: string;
  authorName: string;
  authorEmail: string;
  authoredAt: string;
  files: GitCommitDetailFile[];
  additions: number;
  deletions: number;
  patch: string;
  truncated: boolean;
  masked: boolean;
  redactionCount: number;
}

export interface GitCommitFileDiff {
  hash: string;
  path: string;
  status: GitCommitFileStatus;
  binary: boolean;
  content: string;
  truncated: boolean;
  masked: boolean;
  redactionCount: number;
}

export interface GitCommitHistoryEntry {
  hash: string;
  shortHash: string;
  subject: string;
  authorName: string;
  authorEmail: string;
  authoredAt: string;
  parentCount: number;
}

export interface GitCommitHistoryPage {
  branch: string;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  commits: GitCommitHistoryEntry[];
}

export class GitCommitDetailsError extends Error {
  public constructor(
    public readonly code:
      | 'GIT_COMMIT_INVALID'
      | 'GIT_COMMIT_NOT_FOUND'
      | 'GIT_COMMIT_FILE_NOT_FOUND'
      | 'GIT_NOT_REPOSITORY',
    message: string,
  ) {
    super(message);
    this.name = 'GitCommitDetailsError';
  }
}

async function runGit(projectPath: string, args: readonly string[]): Promise<string> {
  const result = await execFileAsync('git', [...args], {
    cwd: projectPath,
    encoding: 'utf8',
    maxBuffer: 24 * 1024 * 1024,
    windowsHide: true,
    env: {
      ...process.env,
      GIT_OPTIONAL_LOCKS: '0',
      LC_ALL: 'C',
    },
  });
  return result.stdout;
}

async function requireRepository(projectPath: string): Promise<void> {
  try {
    await runGit(projectPath, ['rev-parse', '--is-inside-work-tree']);
  } catch {
    throw new GitCommitDetailsError(
      'GIT_NOT_REPOSITORY',
      'O projeto não é um repositório Git.',
    );
  }
}

function parseHistory(output: string): GitCommitHistoryEntry[] {
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

function filterHistory(
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

function hasHistoryFilters(filters: GitCommitHistoryFilters): boolean {
  return Boolean(
    filters.search?.trim()
    || filters.author?.trim()
    || filters.kind && filters.kind !== 'all',
  );
}

function statusFromCode(code: string): GitCommitFileStatus {
  const normalized = code[0]?.toUpperCase() ?? 'M';
  if (normalized === 'A') return 'added';
  if (normalized === 'D') return 'deleted';
  if (normalized === 'R') return 'renamed';
  if (normalized === 'C') return 'copied';
  if (normalized === 'T') return 'type-changed';
  return 'modified';
}

function parseNameStatus(output: string): Map<string, {
  status: GitCommitFileStatus;
  previousPath?: string;
}> {
  const result = new Map<string, {
    status: GitCommitFileStatus;
    previousPath?: string;
  }>();
  const records = output.split('\0').filter(Boolean);

  for (let index = 0; index < records.length; index += 1) {
    const code = records[index] ?? '';
    const status = statusFromCode(code);
    if (status === 'renamed' || status === 'copied') {
      const previousPath = records[index + 1] ?? '';
      const currentPath = records[index + 2] ?? '';
      index += 2;
      if (currentPath) result.set(currentPath, { status, previousPath });
      continue;
    }

    const filePath = records[index + 1] ?? '';
    index += 1;
    if (filePath) result.set(filePath, { status });
  }

  return result;
}

function parseNumstat(
  output: string,
  statuses: Map<string, { status: GitCommitFileStatus; previousPath?: string }>,
): GitCommitDetailFile[] {
  const files: GitCommitDetailFile[] = [];
  const records = output.split('\0');
  let index = 0;

  while (index < records.length) {
    const record = records[index];
    index += 1;
    if (!record) continue;

    const [additionsRaw = '0', deletionsRaw = '0', ...pathParts] = record.split('\t');
    let filePath = pathParts.join('\t');
    let previousPath: string | undefined;

    // Em renomeações o `-z` quebra o registro em três: contagens, caminho
    // anterior e caminho novo. Sem consumir os dois seguintes, o arquivo
    // renomeado desaparecia da lista.
    if (!filePath) {
      previousPath = records[index] ?? '';
      index += 1;
      filePath = records[index] ?? '';
      index += 1;
      if (!filePath) continue;
    }

    const binary = additionsRaw === '-' || deletionsRaw === '-';
    const status = statuses.get(filePath);
    const effectivePreviousPath = status?.previousPath ?? previousPath;
    files.push({
      path: filePath,
      ...(effectivePreviousPath ? { previousPath: effectivePreviousPath } : {}),
      status: status?.status ?? (previousPath ? 'renamed' : 'modified'),
      additions: binary ? 0 : Number.parseInt(additionsRaw, 10) || 0,
      deletions: binary ? 0 : Number.parseInt(deletionsRaw, 10) || 0,
      binary,
    });
  }

  return files;
}

async function resolveHistoryReference(
  projectPath: string,
  requestedReference?: string,
): Promise<{ label: string; revision: string; exists: boolean }> {
  const currentBranch = (await runGit(projectPath, ['branch', '--show-current'])).trim();
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

const HISTORY_FORMAT = `--format=%H${FIELD_SEPARATOR}%h${FIELD_SEPARATOR}%s${FIELD_SEPARATOR}%an${FIELD_SEPARATOR}%ae${FIELD_SEPARATOR}%aI${FIELD_SEPARATOR}%P${RECORD_SEPARATOR}`;

export async function listBranchCommits(
  projectPath: string,
  requestedReference: string | undefined,
  requestedPage = 1,
  requestedPageSize = 10,
  filters: GitCommitHistoryFilters = {},
): Promise<GitCommitHistoryPage> {
  await requireRepository(projectPath);

  const page = Math.max(1, Math.floor(requestedPage));
  const pageSize = Math.min(10, Math.max(1, Math.floor(requestedPageSize)));
  const reference = await resolveHistoryReference(projectPath, requestedReference);

  if (!reference.exists) {
    return {
      branch: reference.label,
      page: 1,
      pageSize,
      total: 0,
      totalPages: 0,
      commits: [],
    };
  }

  if (hasHistoryFilters(filters)) {
    const output = await runGit(projectPath, [
      'log',
      HISTORY_FORMAT,
      reference.revision,
      '--',
    ]);
    const filtered = filterHistory(parseHistory(output), filters);
    const total = filtered.length;
    const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
    const effectivePage = totalPages === 0 ? 1 : Math.min(page, totalPages);
    const start = (effectivePage - 1) * pageSize;
    return {
      branch: reference.label,
      page: effectivePage,
      pageSize,
      total,
      totalPages,
      commits: filtered.slice(start, start + pageSize),
    };
  }

  const total = Number.parseInt(
    (await runGit(projectPath, ['rev-list', '--count', reference.revision])).trim(),
    10,
  ) || 0;
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  const effectivePage = totalPages === 0 ? 1 : Math.min(page, totalPages);
  const skip = (effectivePage - 1) * pageSize;
  const output = await runGit(projectPath, [
    'log',
    `--skip=${skip}`,
    `-n${pageSize}`,
    HISTORY_FORMAT,
    reference.revision,
    '--',
  ]);

  return {
    branch: reference.label,
    page: effectivePage,
    pageSize,
    total,
    totalPages,
    commits: parseHistory(output),
  };
}

export async function listCurrentBranchCommits(
  projectPath: string,
  requestedPage = 1,
  requestedPageSize = 10,
): Promise<GitCommitHistoryPage> {
  return listBranchCommits(
    projectPath,
    undefined,
    requestedPage,
    requestedPageSize,
  );
}

export async function inspectGitCommit(
  projectPath: string,
  commitHash: string,
): Promise<GitCommitDetails> {
  if (!COMMIT_HASH_PATTERN.test(commitHash)) {
    throw new GitCommitDetailsError('GIT_COMMIT_INVALID', 'Hash de commit inválido.');
  }

  await requireRepository(projectPath);

  try {
    await runGit(projectPath, ['rev-parse', '--verify', `${commitHash}^{commit}`]);
  } catch {
    throw new GitCommitDetailsError('GIT_COMMIT_NOT_FOUND', 'Commit não encontrado neste repositório.');
  }

  const metadata = await runGit(projectPath, [
    'show',
    '--no-patch',
    `--format=%H${FIELD_SEPARATOR}%h${FIELD_SEPARATOR}%s${FIELD_SEPARATOR}%an${FIELD_SEPARATOR}%ae${FIELD_SEPARATOR}%aI${FIELD_SEPARATOR}%B`,
    commitHash,
  ]);
  const [
    hash = '',
    shortHash = '',
    subject = '',
    authorName = '',
    authorEmail = '',
    authoredAt = '',
    ...bodyParts
  ] = metadata.split(FIELD_SEPARATOR);

  const [nameStatus, numstat, rawPatch] = await Promise.all([
    runGit(projectPath, ['show', '--format=', '--name-status', '-z', '--find-renames', commitHash]),
    runGit(projectPath, ['show', '--format=', '--numstat', '-z', '--find-renames', commitHash]),
    runGit(projectPath, ['show', '--format=', '--find-renames', '--no-ext-diff', '--unified=3', commitHash]),
  ]);

  const statuses = parseNameStatus(nameStatus);
  const files = parseNumstat(numstat, statuses);
  const additions = files.reduce((total, file) => total + file.additions, 0);
  const deletions = files.reduce((total, file) => total + file.deletions, 0);
  const truncated = rawPatch.length > PATCH_LIMIT;
  const patchSlice = truncated ? rawPatch.slice(0, PATCH_LIMIT) : rawPatch;
  const maskedPatch = maskSensitiveLogContent(patchSlice);

  return {
    hash: hash.trim(),
    shortHash: shortHash.trim(),
    subject: subject.trim(),
    body: bodyParts.join(FIELD_SEPARATOR).trim(),
    authorName: authorName.trim(),
    authorEmail: authorEmail.trim(),
    authoredAt: authoredAt.trim(),
    files,
    additions,
    deletions,
    patch: maskedPatch.content,
    truncated,
    masked: maskedPatch.masked,
    redactionCount: maskedPatch.redactionCount,
  };
}

/**
 * Diff de um único arquivo dentro de um commit — é o que a tela de histórico
 * carrega sob demanda, em vez de trazer o patch inteiro de uma vez.
 *
 * O caminho vem do navegador, mas só é aceito se constar da própria lista de
 * arquivos do commit; nada de caminho arbitrário chegando ao `git show`.
 */
export async function inspectGitCommitFile(
  projectPath: string,
  commitHash: string,
  filePath: string,
): Promise<GitCommitFileDiff> {
  if (!COMMIT_HASH_PATTERN.test(commitHash)) {
    throw new GitCommitDetailsError('GIT_COMMIT_INVALID', 'Hash de commit inválido.');
  }

  await requireRepository(projectPath);

  try {
    await runGit(projectPath, ['rev-parse', '--verify', `${commitHash}^{commit}`]);
  } catch {
    throw new GitCommitDetailsError('GIT_COMMIT_NOT_FOUND', 'Commit não encontrado neste repositório.');
  }

  const nameStatus = await runGit(projectPath, [
    'show', '--format=', '--name-status', '-z', '--find-renames', commitHash,
  ]);
  const numstat = await runGit(projectPath, [
    'show', '--format=', '--numstat', '-z', '--find-renames', commitHash,
  ]);
  const entry = parseNumstat(numstat, parseNameStatus(nameStatus))
    .find((file) => file.path === filePath);

  if (!entry) {
    throw new GitCommitDetailsError(
      'GIT_COMMIT_FILE_NOT_FOUND',
      'O arquivo não faz parte deste commit.',
    );
  }

  // Renomeados precisam do caminho anterior para o git localizar as duas pontas.
  const pathArguments = entry.previousPath ? [entry.previousPath, entry.path] : [entry.path];
  const raw = await runGit(projectPath, [
    'show', '--format=', '--find-renames', '--no-ext-diff', '--unified=3',
    commitHash, '--', ...pathArguments,
  ]);

  const binary = entry.binary || /^Binary files /m.test(raw);
  const truncated = raw.length > FILE_PATCH_LIMIT;
  const masked = maskSensitiveLogContent(truncated ? raw.slice(0, FILE_PATCH_LIMIT) : raw);

  return {
    hash: commitHash,
    path: entry.path,
    status: entry.status,
    binary,
    content: binary ? '' : masked.content,
    truncated,
    masked: masked.masked,
    redactionCount: masked.redactionCount,
  };
}
