import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const MAX_PAGES = 5;
const PAGE_SIZE = 100;
const MAX_CANDIDATES = 10;

type CommandRunner = (
  command: string,
  args: readonly string[],
  cwd: string,
) => Promise<string | null>;

export interface AgentBacklogIssue {
  repository: string;
  number: number;
  title: string;
  labels: string[];
}

export type AgentBacklogSelection =
  | {
      status: 'selected';
      source: string;
      issue: AgentBacklogIssue;
      candidates: [];
    }
  | {
      status: 'ambiguous';
      source: string;
      candidates: AgentBacklogIssue[];
    };

export type GithubIssueBacklogErrorCode =
  | 'GITHUB_BACKLOG_REPOSITORY_UNAVAILABLE'
  | 'GITHUB_BACKLOG_REMOTE_UNAVAILABLE'
  | 'GITHUB_BACKLOG_ISSUE_NOT_FOUND';

export class GithubIssueBacklogError extends Error {
  public constructor(
    public readonly code: GithubIssueBacklogErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'GithubIssueBacklogError';
  }
}

export interface GithubIssueBacklogServiceOptions {
  fetchImpl?: typeof fetch;
  commandRunner?: CommandRunner;
  timeoutMs?: number;
}

interface GithubRepository {
  owner: string;
  repo: string;
  fullName: string;
}

interface GithubApiResult {
  data: unknown | null;
}

async function runCommand(
  command: string,
  args: readonly string[],
  cwd: string,
): Promise<string | null> {
  try {
    const result = await execFileAsync(command, [...args], {
      cwd,
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true,
      env: {
        ...process.env,
        LC_ALL: 'C',
      },
    });
    return result.stdout.trim();
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function validRepositoryPart(value: string): boolean {
  return /^[A-Za-z0-9_.-]+$/.test(value);
}

function parseGithubRepository(remote: string): GithubRepository | null {
  const trimmed = remote.trim();
  let owner = '';
  let repo = '';

  try {
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      const url = new URL(trimmed);
      if (url.hostname.toLowerCase() !== 'github.com') return null;
      const parts = url.pathname.split('/').filter(Boolean);
      owner = parts[0] ?? '';
      repo = parts[1] ?? '';
    } else if (trimmed.startsWith('ssh://')) {
      const url = new URL(trimmed);
      if (url.hostname.toLowerCase() !== 'github.com') return null;
      const parts = url.pathname.split('/').filter(Boolean);
      owner = parts[0] ?? '';
      repo = parts[1] ?? '';
    } else {
      const match = /^git@github\.com:([^/]+)\/(.+)$/.exec(trimmed);
      owner = match?.[1] ?? '';
      repo = match?.[2] ?? '';
    }
  } catch {
    return null;
  }

  repo = repo.replace(/\.git$/, '');
  if (
    !owner ||
    !repo ||
    !validRepositoryPart(owner) ||
    !validRepositoryPart(repo)
  ) {
    return null;
  }

  return { owner, repo, fullName: owner + '/' + repo };
}

function labelsFromPayload(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const labels: string[] = [];
  for (const rawLabel of value) {
    if (typeof rawLabel === 'string' && rawLabel.trim()) {
      labels.push(rawLabel.trim());
      continue;
    }
    const name = asRecord(rawLabel)?.name;
    if (typeof name === 'string' && name.trim()) labels.push(name.trim());
  }
  return labels;
}

function parseIssue(
  repository: GithubRepository,
  value: unknown,
): AgentBacklogIssue | null {
  const record = asRecord(value);
  if (!record || record.pull_request !== undefined) return null;
  if (record.state !== 'open') return null;
  const number = record.number;
  const title = record.title;
  if (
    typeof number !== 'number' ||
    !Number.isInteger(number) ||
    number < 1 ||
    typeof title !== 'string' ||
    !title.trim()
  ) {
    return null;
  }

  return {
    repository: repository.fullName,
    number,
    title: title.trim(),
    labels: labelsFromPayload(record.labels),
  };
}

function explicitPriority(
  issue: AgentBacklogIssue,
): { rank: number; source: string } | null {
  const ranks = new Map<string, number>([
    ['next', 0],
    ['priority:next', 0],
    ['priority:p0', 10],
    ['p0', 10],
    ['priority:p1', 20],
    ['p1', 20],
    ['priority:p2', 30],
    ['p2', 30],
    ['priority:p3', 40],
    ['p3', 40],
  ]);

  let selected: { rank: number; source: string } | null = null;
  for (const label of issue.labels) {
    const normalized = label.trim().toLowerCase();
    const rank = ranks.get(normalized);
    if (rank === undefined) continue;
    if (!selected || rank < selected.rank) {
      selected = { rank, source: 'label:' + normalized };
    }
  }
  return selected;
}

export class GithubIssueBacklogService {
  private readonly fetchImpl: typeof fetch;
  private readonly commandRunner: CommandRunner;
  private readonly timeoutMs: number;

  public constructor(options: GithubIssueBacklogServiceOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.commandRunner = options.commandRunner ?? runCommand;
    this.timeoutMs = options.timeoutMs ?? 4_000;
  }

  public async select(
    projectPath: string,
    issueNumber?: number,
  ): Promise<AgentBacklogSelection> {
    const repository = await this.resolveRepository(projectPath);
    if (issueNumber !== undefined) {
      const issue = await this.loadSpecificIssue(
        projectPath,
        repository,
        issueNumber,
      );
      if (!issue) {
        throw new GithubIssueBacklogError(
          'GITHUB_BACKLOG_ISSUE_NOT_FOUND',
          'A issue solicitada não está aberta ou não pertence a este repositório.',
        );
      }
      return {
        status: 'selected',
        source: 'specific-issue',
        issue,
        candidates: [],
      };
    }

    const issues = await this.listOpenIssues(projectPath, repository);
    if (issues.length === 0) {
      return {
        status: 'ambiguous',
        source: 'no-eligible-issues',
        candidates: [],
      };
    }

    const prioritized = issues
      .map((issue) => ({ issue, priority: explicitPriority(issue) }))
      .filter(
        (
          item,
        ): item is {
          issue: AgentBacklogIssue;
          priority: { rank: number; source: string };
        } => item.priority !== null,
      );

    if (prioritized.length === 0) {
      return {
        status: 'ambiguous',
        source: 'no-explicit-priority',
        candidates: issues
          .slice()
          .sort((left, right) => left.number - right.number)
          .slice(0, MAX_CANDIDATES),
      };
    }

    const bestRank = Math.min(...prioritized.map((item) => item.priority.rank));
    const best = prioritized.filter((item) => item.priority.rank === bestRank);
    if (best.length !== 1) {
      return {
        status: 'ambiguous',
        source: 'priority-tie',
        candidates: best
          .map((item) => item.issue)
          .sort((left, right) => left.number - right.number)
          .slice(0, MAX_CANDIDATES),
      };
    }

    return {
      status: 'selected',
      source: best[0]!.priority.source,
      issue: best[0]!.issue,
      candidates: [],
    };
  }

  private async resolveRepository(
    projectPath: string,
  ): Promise<GithubRepository> {
    const remote = await this.commandRunner(
      'git',
      ['remote', 'get-url', 'origin'],
      projectPath,
    );
    const repository = remote ? parseGithubRepository(remote) : null;
    if (!repository) {
      throw new GithubIssueBacklogError(
        'GITHUB_BACKLOG_REPOSITORY_UNAVAILABLE',
        'O origin do projeto não identifica um repositório GitHub suportado.',
      );
    }
    return repository;
  }

  private async loadSpecificIssue(
    projectPath: string,
    repository: GithubRepository,
    issueNumber: number,
  ): Promise<AgentBacklogIssue | null> {
    if (!Number.isInteger(issueNumber) || issueNumber < 1) {
      throw new GithubIssueBacklogError(
        'GITHUB_BACKLOG_ISSUE_NOT_FOUND',
        'O número da issue solicitada é inválido.',
      );
    }

    const result = await this.githubJson(
      projectPath,
      repository,
      'issues/' + issueNumber,
    );
    return parseIssue(repository, result.data);
  }

  private async listOpenIssues(
    projectPath: string,
    repository: GithubRepository,
  ): Promise<AgentBacklogIssue[]> {
    const issues: AgentBacklogIssue[] = [];

    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const result = await this.githubJson(
        projectPath,
        repository,
        'issues?state=open&per_page=' + PAGE_SIZE + '&page=' + page,
      );
      if (!Array.isArray(result.data)) {
        throw new GithubIssueBacklogError(
          'GITHUB_BACKLOG_REMOTE_UNAVAILABLE',
          'O backlog do GitHub não pôde ser consultado.',
        );
      }

      for (const rawIssue of result.data) {
        const issue = parseIssue(repository, rawIssue);
        if (issue) issues.push(issue);
      }

      if (result.data.length < PAGE_SIZE) break;
    }

    return issues;
  }

  private async githubJson(
    projectPath: string,
    repository: GithubRepository,
    suffix: string,
  ): Promise<GithubApiResult> {
    const endpoint =
      'repos/' + repository.owner + '/' + repository.repo + '/' + suffix;
    const publicResult = await this.fetchGithubJson(endpoint);
    if (publicResult.data !== null) return publicResult;

    const output = await this.commandRunner(
      'gh',
      ['api', '--hostname', 'github.com', endpoint],
      projectPath,
    );
    if (!output) {
      throw new GithubIssueBacklogError(
        'GITHUB_BACKLOG_REMOTE_UNAVAILABLE',
        'O backlog do GitHub está indisponível ou não autenticado.',
      );
    }

    try {
      return { data: JSON.parse(output) as unknown };
    } catch {
      throw new GithubIssueBacklogError(
        'GITHUB_BACKLOG_REMOTE_UNAVAILABLE',
        'O GitHub retornou uma resposta de backlog inválida.',
      );
    }
  }

  private async fetchGithubJson(endpoint: string): Promise<GithubApiResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(
        new URL('https://api.github.com/' + endpoint),
        {
          method: 'GET',
          headers: {
            Accept: 'application/vnd.github+json',
            'User-Agent': 'dev-dashboard',
          },
          signal: controller.signal,
        },
      );
      if (!response.ok) return { data: null };
      return { data: (await response.json()) as unknown };
    } catch {
      return { data: null };
    } finally {
      clearTimeout(timeout);
    }
  }
}
