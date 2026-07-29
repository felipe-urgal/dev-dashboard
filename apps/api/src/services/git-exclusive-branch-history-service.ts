import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const FIELD_SEPARATOR = '\u001f';
const RECORD_SEPARATOR = '\u001e';
const HISTORY_FORMAT = `--format=%H${FIELD_SEPARATOR}%h${FIELD_SEPARATOR}%s${FIELD_SEPARATOR}%an${FIELD_SEPARATOR}%ae${FIELD_SEPARATOR}%aI${FIELD_SEPARATOR}%P${RECORD_SEPARATOR}`;
const HISTORY_REFERENCE_PATTERN = /^(?!-)[^\u0000-\u001f\u007f]{1,250}$/;

export type ExclusiveBranchHistoryKind = 'all' | 'merge' | 'regular';

export interface ExclusiveBranchCommitSummary {
  hash: string;
  shortHash: string;
  subject: string;
  authorName: string;
  authorEmail: string;
  authoredAt: string;
  parentCount: number;
}

export interface ExclusiveBranchHistoryPage {
  branch: string;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  commits: ExclusiveBranchCommitSummary[];
}

export interface ExclusiveBranchHistoryOptions {
  reference?: string;
  page?: number;
  pageSize?: number;
  search?: string;
  author?: string;
  kind?: ExclusiveBranchHistoryKind;
}

export class ExclusiveBranchHistoryError extends Error {
  public constructor(
    public readonly code:
      | 'GIT_REFERENCE_INVALID'
      | 'GIT_REFERENCE_NOT_FOUND'
      | 'GIT_NOT_REPOSITORY',
    message: string,
  ) {
    super(message);
    this.name = 'ExclusiveBranchHistoryError';
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
    throw new ExclusiveBranchHistoryError(
      'GIT_NOT_REPOSITORY',
      'O projeto não é um repositório Git.',
    );
  }
}

async function referenceExists(projectPath: string, reference: string): Promise<boolean> {
  try {
    await runGit(projectPath, [
      'rev-parse',
      '--verify',
      '--quiet',
      '--end-of-options',
      `${reference}^{commit}`,
    ]);
    return true;
  } catch {
    return false;
  }
}

async function remoteDefaultReference(
  projectPath: string,
  remote: string,
): Promise<string | undefined> {
  try {
    const value = (await runGit(projectPath, [
      'symbolic-ref',
      '--quiet',
      '--short',
      `refs/remotes/${remote}/HEAD`,
    ])).trim();
    return value || undefined;
  } catch {
    return undefined;
  }
}

function parseHistory(output: string): ExclusiveBranchCommitSummary[] {
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
  commits: readonly ExclusiveBranchCommitSummary[],
  options: ExclusiveBranchHistoryOptions,
): ExclusiveBranchCommitSummary[] {
  const search = normalized(options.search);
  const author = normalized(options.author);
  const kind = options.kind ?? 'all';

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

function hasFilters(options: ExclusiveBranchHistoryOptions): boolean {
  return Boolean(
    options.search?.trim()
    || options.author?.trim()
    || options.kind && options.kind !== 'all',
  );
}

function branchNameFromReference(reference: string): string {
  const parts = reference.split('/').filter(Boolean);
  return parts.at(-1) ?? reference;
}

async function resolveReference(
  projectPath: string,
  requestedReference?: string,
): Promise<{ label: string; revision: string; exists: boolean }> {
  const currentBranch = (await runGit(projectPath, ['branch', '--show-current'])).trim();
  const requested = requestedReference?.trim() ?? '';
  const revision = requested || 'HEAD';
  const label = requested || currentBranch || 'HEAD destacado';

  if (requested && !HISTORY_REFERENCE_PATTERN.test(requested)) {
    throw new ExclusiveBranchHistoryError(
      'GIT_REFERENCE_INVALID',
      'Referência Git inválida para consultar o histórico.',
    );
  }

  const exists = await referenceExists(projectPath, revision);
  if (exists) return { label, revision, exists: true };
  if (!requested) return { label, revision, exists: false };
  throw new ExclusiveBranchHistoryError(
    'GIT_REFERENCE_NOT_FOUND',
    `A referência Git "${requested}" não foi encontrada.`,
  );
}

async function resolveExclusiveRevision(
  projectPath: string,
  reference: { label: string; revision: string },
): Promise<string> {
  const [upstreamDefault, originDefault] = await Promise.all([
    remoteDefaultReference(projectPath, 'upstream'),
    remoteDefaultReference(projectPath, 'origin'),
  ]);
  const candidates = [
    upstreamDefault,
    originDefault,
    'upstream/main',
    'origin/main',
    'main',
    'upstream/master',
    'origin/master',
    'master',
  ].filter((value): value is string => Boolean(value));
  const defaultBranchNames = new Set(candidates.map(branchNameFromReference));
  defaultBranchNames.add('main');
  defaultBranchNames.add('master');

  const selectedName = branchNameFromReference(reference.label);
  if (defaultBranchNames.has(selectedName)) return reference.revision;

  const visited = new Set<string>();
  for (const candidate of candidates) {
    if (visited.has(candidate)) continue;
    visited.add(candidate);
    if (candidate === reference.revision) continue;
    if (!await referenceExists(projectPath, candidate)) continue;

    try {
      const mergeBase = (await runGit(projectPath, [
        'merge-base',
        '--',
        reference.revision,
        candidate,
      ])).trim();
      if (mergeBase) return `${candidate}..${reference.revision}`;
    } catch {
      // Tenta a próxima referência principal disponível.
    }
  }

  return reference.revision;
}

export async function listExclusiveBranchCommits(
  projectPath: string,
  options: ExclusiveBranchHistoryOptions = {},
): Promise<ExclusiveBranchHistoryPage> {
  await requireRepository(projectPath);

  const page = Math.max(1, Math.floor(options.page ?? 1));
  const pageSize = Math.min(10, Math.max(1, Math.floor(options.pageSize ?? 10)));
  const reference = await resolveReference(projectPath, options.reference);

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

  const revision = await resolveExclusiveRevision(projectPath, reference);
  if (hasFilters(options)) {
    const output = await runGit(projectPath, ['log', HISTORY_FORMAT, revision, '--']);
    const filtered = filterHistory(parseHistory(output), options);
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
    (await runGit(projectPath, ['rev-list', '--count', revision])).trim(),
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
    revision,
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
