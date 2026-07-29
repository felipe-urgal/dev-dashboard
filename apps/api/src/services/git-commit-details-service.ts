import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { maskSensitiveLogContent } from '@dev-dashboard/process-manager';

const execFileAsync = promisify(execFile);
const FIELD_SEPARATOR = '\u001f';
const RECORD_SEPARATOR = '\u001e';
const PATCH_LIMIT = 320_000;
const COMMIT_HASH_PATTERN = /^[0-9a-f]{7,40}$/i;

export type GitCommitFileStatus =
  | 'added'
  | 'modified'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'type-changed';

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

export interface GitCommitHistoryEntry {
  hash: string;
  shortHash: string;
  subject: string;
  authorName: string;
  authorEmail: string;
  authoredAt: string;
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
    maxBuffer: 6 * 1024 * 1024,
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
      ] = record.split(FIELD_SEPARATOR);
      return {
        hash,
        shortHash,
        subject,
        authorName,
        authorEmail,
        authoredAt,
      };
    });
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
  const records = output.split('\0').filter(Boolean);

  for (const record of records) {
    const [additionsRaw = '0', deletionsRaw = '0', ...pathParts] = record.split('\t');
    const filePath = pathParts.join('\t');
    if (!filePath) continue;
    const binary = additionsRaw === '-' || deletionsRaw === '-';
    const status = statuses.get(filePath);
    files.push({
      path: filePath,
      ...(status?.previousPath ? { previousPath: status.previousPath } : {}),
      status: status?.status ?? 'modified',
      additions: binary ? 0 : Number.parseInt(additionsRaw, 10) || 0,
      deletions: binary ? 0 : Number.parseInt(deletionsRaw, 10) || 0,
      binary,
    });
  }

  return files;
}

export async function listCurrentBranchCommits(
  projectPath: string,
  requestedPage = 1,
  requestedPageSize = 10,
): Promise<GitCommitHistoryPage> {
  await requireRepository(projectPath);

  const page = Math.max(1, Math.floor(requestedPage));
  const pageSize = Math.min(10, Math.max(1, Math.floor(requestedPageSize)));
  const branch = (await runGit(projectPath, ['branch', '--show-current'])).trim() || 'HEAD destacado';

  try {
    await runGit(projectPath, ['rev-parse', '--verify', 'HEAD']);
  } catch {
    return {
      branch,
      page: 1,
      pageSize,
      total: 0,
      totalPages: 0,
      commits: [],
    };
  }

  const total = Number.parseInt(
    (await runGit(projectPath, ['rev-list', '--count', 'HEAD'])).trim(),
    10,
  ) || 0;
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  const effectivePage = totalPages === 0 ? 1 : Math.min(page, totalPages);
  const skip = (effectivePage - 1) * pageSize;
  const output = await runGit(projectPath, [
    'log',
    'HEAD',
    `--skip=${skip}`,
    `-n${pageSize}`,
    `--format=%H${FIELD_SEPARATOR}%h${FIELD_SEPARATOR}%s${FIELD_SEPARATOR}%an${FIELD_SEPARATOR}%ae${FIELD_SEPARATOR}%aI${RECORD_SEPARATOR}`,
  ]);

  return {
    branch,
    page: effectivePage,
    pageSize,
    total,
    totalPages,
    commits: parseHistory(output),
  };
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
