import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const FIELD_SEPARATOR = '\u001f';
const RECORD_SEPARATOR = '\u001e';
const HISTORY_FORMAT = `--format=%H${FIELD_SEPARATOR}%h${FIELD_SEPARATOR}%s${FIELD_SEPARATOR}%an${FIELD_SEPARATOR}%ae${FIELD_SEPARATOR}%aI${FIELD_SEPARATOR}%P${RECORD_SEPARATOR}`;

export interface CurrentBranchCommitSummary {
  hash: string;
  shortHash: string;
  subject: string;
  authorName: string;
  authorEmail: string;
  authoredAt: string;
  parentCount: number;
}

export interface CurrentBranchHistoryPage {
  branch: string;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  commits: CurrentBranchCommitSummary[];
}

export interface CurrentBranchHistoryOptions {
  page?: number;
  pageSize?: number;
  search?: string;
}

export class CurrentBranchHistoryError extends Error {
  public constructor(
    public readonly code: 'GIT_NOT_REPOSITORY',
    message: string,
  ) {
    super(message);
    this.name = 'CurrentBranchHistoryError';
  }
}

async function runGit(
  projectPath: string,
  args: readonly string[],
): Promise<string> {
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
    throw new CurrentBranchHistoryError(
      'GIT_NOT_REPOSITORY',
      'O projeto não é um repositório Git.',
    );
  }
}

async function referenceExists(
  projectPath: string,
  reference: string,
): Promise<boolean> {
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
    const value = (
      await runGit(projectPath, [
        'symbolic-ref',
        '--quiet',
        '--short',
        `refs/remotes/${remote}/HEAD`,
      ])
    ).trim();
    return value || undefined;
  } catch {
    return undefined;
  }
}

function parseHistory(output: string): CurrentBranchCommitSummary[] {
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

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase('pt-BR');
}

function filterBySearch(
  commits: readonly CurrentBranchCommitSummary[],
  search: string,
): CurrentBranchCommitSummary[] {
  const query = normalized(search);
  if (!query) return [...commits];
  return commits.filter((commit) =>
    [
      commit.hash,
      commit.shortHash,
      commit.subject,
      commit.authorName,
      commit.authorEmail,
    ].some((value) => normalized(value).includes(query)),
  );
}

function branchNameFromReference(reference: string): string {
  const parts = reference.split('/').filter(Boolean);
  return parts.at(-1) ?? reference;
}

async function resolveExclusiveRevision(
  projectPath: string,
  branch: string,
): Promise<string> {
  if (!branch) return 'HEAD';

  const [upstreamDefault, originDefault] = await Promise.all([
    remoteDefaultReference(projectPath, 'upstream'),
    remoteDefaultReference(projectPath, 'origin'),
  ]);

  const defaultBranchNames = new Set(
    [upstreamDefault, originDefault]
      .filter((value): value is string => Boolean(value))
      .map(branchNameFromReference),
  );
  defaultBranchNames.add('main');
  defaultBranchNames.add('master');

  if (defaultBranchNames.has(branch)) return 'HEAD';

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

  const visited = new Set<string>();
  for (const candidate of candidates) {
    if (visited.has(candidate)) continue;
    visited.add(candidate);
    if (candidate === branch || branchNameFromReference(candidate) === branch)
      continue;
    if (!(await referenceExists(projectPath, candidate))) continue;

    try {
      const mergeBase = (
        await runGit(projectPath, ['merge-base', '--', 'HEAD', candidate])
      ).trim();
      if (mergeBase) return `${mergeBase}..HEAD`;
    } catch {
      // Tenta a próxima referência principal disponível.
    }
  }

  return 'HEAD';
}

export async function listCurrentBranchOnlyCommits(
  projectPath: string,
  options: CurrentBranchHistoryOptions = {},
): Promise<CurrentBranchHistoryPage> {
  await requireRepository(projectPath);

  const page = Math.max(1, Math.floor(options.page ?? 1));
  const pageSize = Math.min(
    10,
    Math.max(1, Math.floor(options.pageSize ?? 10)),
  );
  const branch =
    (await runGit(projectPath, ['branch', '--show-current'])).trim() ||
    'HEAD destacado';

  if (!(await referenceExists(projectPath, 'HEAD'))) {
    return {
      branch,
      page: 1,
      pageSize,
      total: 0,
      totalPages: 0,
      commits: [],
    };
  }

  const revision = await resolveExclusiveRevision(
    projectPath,
    branch === 'HEAD destacado' ? '' : branch,
  );
  const search = options.search?.trim() ?? '';

  if (search) {
    const output = await runGit(projectPath, [
      'log',
      HISTORY_FORMAT,
      revision,
      '--',
    ]);
    const filtered = filterBySearch(parseHistory(output), search);
    const total = filtered.length;
    const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
    const effectivePage = totalPages === 0 ? 1 : Math.min(page, totalPages);
    const start = (effectivePage - 1) * pageSize;
    return {
      branch,
      page: effectivePage,
      pageSize,
      total,
      totalPages,
      commits: filtered.slice(start, start + pageSize),
    };
  }

  const total =
    Number.parseInt(
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
    branch,
    page: effectivePage,
    pageSize,
    total,
    totalPages,
    commits: parseHistory(output),
  };
}
