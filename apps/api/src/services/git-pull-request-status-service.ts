import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type {
  GitOpenPullRequest,
  GitPullRequestCiStatus,
} from '@dev-dashboard/contracts';

const execFileAsync = promisify(execFile);

type ProviderCli = (
  command: string,
  args: readonly string[],
  cwd: string,
) => Promise<string | null>;

export interface GitPullRequestStatusServiceOptions {
  fetchImpl?: typeof fetch;
  providerCliImpl?: ProviderCli;
  timeoutMs?: number;
  cacheTtlMs?: number;
}

interface GithubLocation {
  owner: string;
  repo: string;
  number: number;
}

interface GitlabLocation {
  projectPath: string;
  number: number;
}

async function runProviderCli(
  command: string,
  args: readonly string[],
  cwd: string,
): Promise<string | null> {
  try {
    const result = await execFileAsync(command, [...args], {
      cwd,
      encoding: 'utf8',
      maxBuffer: 2 * 1024 * 1024,
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
  return value !== null && typeof value === 'object'
    ? value as Record<string, unknown>
    : null;
}

function asNonNegativeInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : undefined;
}

function parseGithubLocation(url: string): GithubLocation | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.toLowerCase() !== 'github.com') return null;
    const parts = parsed.pathname.split('/').filter(Boolean);
    const number = Number(parts[3]);
    if (
      parts.length < 4
      || parts[2] !== 'pull'
      || !parts[0]
      || !parts[1]
      || !Number.isInteger(number)
      || number < 1
    ) {
      return null;
    }
    return { owner: parts[0], repo: parts[1], number };
  } catch {
    return null;
  }
}

function parseGitlabLocation(url: string): GitlabLocation | null {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.toLowerCase().includes('gitlab')) return null;
    const marker = '/-/merge_requests/';
    const markerIndex = parsed.pathname.indexOf(marker);
    if (markerIndex <= 0) return null;
    const projectPath = parsed.pathname.slice(1, markerIndex);
    const number = Number(parsed.pathname.slice(markerIndex + marker.length).split('/')[0]);
    if (!projectPath || !Number.isInteger(number) || number < 1) return null;
    return { projectPath, number };
  } catch {
    return null;
  }
}

function githubCheckRunStatus(payload: unknown): GitPullRequestCiStatus | null {
  const record = asRecord(payload);
  const runs = Array.isArray(record?.check_runs) ? record.check_runs : [];
  if (runs.length === 0) return null;

  let hasPending = false;
  for (const rawRun of runs) {
    const run = asRecord(rawRun);
    if (!run) continue;
    if (run.status !== 'completed') {
      hasPending = true;
      continue;
    }

    const conclusion = run.conclusion;
    if (conclusion === 'success' || conclusion === 'neutral' || conclusion === 'skipped') {
      continue;
    }
    if (conclusion === null || conclusion === undefined) {
      hasPending = true;
      continue;
    }
    return 'failure';
  }

  return hasPending ? 'pending' : 'success';
}

function githubCommitStatus(payload: unknown): GitPullRequestCiStatus | null {
  const record = asRecord(payload);
  const statuses = Array.isArray(record?.statuses) ? record.statuses : [];
  if (statuses.length === 0) return null;
  if (record?.state === 'success') return 'success';
  if (record?.state === 'pending') return 'pending';
  if (record?.state === 'failure' || record?.state === 'error') return 'failure';
  return null;
}

function combineCiStatuses(
  statuses: Array<GitPullRequestCiStatus | null>,
): GitPullRequestCiStatus {
  if (statuses.includes('failure')) return 'failure';
  if (statuses.includes('pending')) return 'pending';
  if (statuses.includes('success')) return 'success';
  return 'unknown';
}

function gitlabPipelineStatus(payload: unknown): GitPullRequestCiStatus {
  const pipeline = asRecord(asRecord(payload)?.head_pipeline);
  const status = pipeline?.status;
  if (status === 'success' || status === 'skipped') return 'success';
  if (
    status === 'created'
    || status === 'waiting_for_resource'
    || status === 'preparing'
    || status === 'pending'
    || status === 'running'
    || status === 'scheduled'
  ) {
    return 'pending';
  }
  if (
    status === 'failed'
    || status === 'canceled'
    || status === 'cancelled'
    || status === 'manual'
  ) {
    return 'failure';
  }
  return 'unknown';
}

export class GitPullRequestStatusService {
  private readonly fetchImpl: typeof fetch;
  private readonly providerCliImpl: ProviderCli;
  private readonly timeoutMs: number;
  private readonly cacheTtlMs: number;
  private readonly cache = new Map<
    string,
    { expiresAt: number; pullRequest: GitOpenPullRequest }
  >();

  public constructor(options: GitPullRequestStatusServiceOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.providerCliImpl = options.providerCliImpl ?? runProviderCli;
    this.timeoutMs = options.timeoutMs ?? 4_000;
    this.cacheTtlMs = options.cacheTtlMs ?? 30_000;
  }

  public async enrich(
    projectPath: string,
    pullRequest: GitOpenPullRequest,
  ): Promise<GitOpenPullRequest> {
    const cached = this.cache.get(pullRequest.url);
    if (cached && cached.expiresAt > Date.now()) return cached.pullRequest;

    const enriched = pullRequest.provider === 'github'
      ? await this.enrichGithub(projectPath, pullRequest)
      : await this.enrichGitlab(pullRequest);

    this.cache.set(pullRequest.url, {
      expiresAt: Date.now() + this.cacheTtlMs,
      pullRequest: enriched,
    });
    return enriched;
  }

  private async enrichGithub(
    projectPath: string,
    pullRequest: GitOpenPullRequest,
  ): Promise<GitOpenPullRequest> {
    const location = parseGithubLocation(pullRequest.url);
    if (!location) return pullRequest;

    const endpoint = `repos/${location.owner}/${location.repo}/pulls/${location.number}`;
    const details = await this.githubJson(projectPath, endpoint);
    const detailsRecord = asRecord(details);
    if (!detailsRecord) return pullRequest;

    const issueComments = asNonNegativeInteger(detailsRecord.comments);
    const reviewComments = asNonNegativeInteger(detailsRecord.review_comments);
    const commentsCount = issueComments === undefined && reviewComments === undefined
      ? undefined
      : (issueComments ?? 0) + (reviewComments ?? 0);
    const headSha = asRecord(detailsRecord.head)?.sha;

    const [commitStatus, checkRuns, unresolvedConversationsCount] = await Promise.all([
      typeof headSha === 'string'
        ? this.githubJson(
            projectPath,
            `repos/${location.owner}/${location.repo}/commits/${headSha}/status`,
          )
        : Promise.resolve(null),
      typeof headSha === 'string'
        ? this.githubJson(
            projectPath,
            `repos/${location.owner}/${location.repo}/commits/${headSha}/check-runs`,
          )
        : Promise.resolve(null),
      (reviewComments ?? 0) > 0
        ? this.githubUnresolvedConversations(projectPath, location)
        : Promise.resolve(0),
    ]);

    const ciStatus = combineCiStatuses([
      githubCommitStatus(commitStatus),
      githubCheckRunStatus(checkRuns),
    ]);

    return {
      ...pullRequest,
      ...(ciStatus !== 'unknown' ? { ciStatus } : {}),
      ...(commentsCount !== undefined ? { commentsCount } : {}),
      ...(unresolvedConversationsCount !== null
        ? { unresolvedConversationsCount }
        : {}),
    };
  }

  private async enrichGitlab(
    pullRequest: GitOpenPullRequest,
  ): Promise<GitOpenPullRequest> {
    const location = parseGitlabLocation(pullRequest.url);
    if (!location) return pullRequest;

    const url = new URL(
      `https://gitlab.com/api/v4/projects/${encodeURIComponent(location.projectPath)}/merge_requests/${location.number}`,
    );
    const details = await this.fetchJson(url, {
      Accept: 'application/json',
      'User-Agent': 'dev-dashboard',
    });
    const record = asRecord(details);
    if (!record) return pullRequest;

    const commentsCount = asNonNegativeInteger(record.user_notes_count);
    const ciStatus = gitlabPipelineStatus(record);
    return {
      ...pullRequest,
      ...(ciStatus !== 'unknown' ? { ciStatus } : {}),
      ...(commentsCount !== undefined ? { commentsCount } : {}),
    };
  }

  private async githubJson(
    projectPath: string,
    endpoint: string,
  ): Promise<unknown | null> {
    const publicResult = await this.fetchJson(
      new URL(`https://api.github.com/${endpoint}`),
      {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'dev-dashboard',
      },
    );
    if (publicResult !== null) return publicResult;

    const output = await this.providerCliImpl(
      'gh',
      ['api', '--hostname', 'github.com', endpoint],
      projectPath,
    );
    if (!output) return null;
    try {
      return JSON.parse(output) as unknown;
    } catch {
      return null;
    }
  }

  private async githubUnresolvedConversations(
    projectPath: string,
    location: GithubLocation,
  ): Promise<number | null> {
    const query = [
      'query($owner:String!,$repo:String!,$number:Int!){',
      'repository(owner:$owner,name:$repo){',
      'pullRequest(number:$number){',
      'reviewThreads(first:100){nodes{isResolved}}',
      '}',
      '}',
      '}',
    ].join('');
    const output = await this.providerCliImpl(
      'gh',
      [
        'api',
        'graphql',
        '-f',
        `query=${query}`,
        '-f',
        `owner=${location.owner}`,
        '-f',
        `repo=${location.repo}`,
        '-F',
        `number=${location.number}`,
      ],
      projectPath,
    );
    if (!output) return null;

    try {
      const payload = asRecord(JSON.parse(output) as unknown);
      const data = asRecord(payload?.data);
      const repository = asRecord(data?.repository);
      const pullRequest = asRecord(repository?.pullRequest);
      const reviewThreads = asRecord(pullRequest?.reviewThreads);
      const nodes = Array.isArray(reviewThreads?.nodes) ? reviewThreads.nodes : null;
      if (!nodes) return null;
      return nodes.filter((node) => asRecord(node)?.isResolved === false).length;
    } catch {
      return null;
    }
  }

  private async fetchJson(
    url: URL,
    headers: Record<string, string>,
  ): Promise<unknown | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });
      if (!response.ok) return null;
      return await response.json() as unknown;
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}
