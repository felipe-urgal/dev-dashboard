import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type {
  GitOpenPullRequest,
  GitPullRequestCheck,
  GitPullRequestCiStatus,
  GitPullRequestCockpit,
  GitPullRequestRemoteStatus,
  GitPullRequestReviewState,
} from '@dev-dashboard/contracts';

const execFileAsync = promisify(execFile);

type ProviderCli = (
  command: string,
  args: readonly string[],
  cwd: string,
) => Promise<string | null>;

type EnrichedPullRequest = GitOpenPullRequest & {
  cockpit?: GitPullRequestCockpit;
};

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

interface RemoteJsonResult {
  data: unknown | null;
  remoteStatus: GitPullRequestRemoteStatus;
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
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
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
      parts.length < 4 ||
      parts[2] !== 'pull' ||
      !parts[0] ||
      !parts[1] ||
      !Number.isInteger(number) ||
      number < 1
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
    const number = Number(
      parsed.pathname.slice(markerIndex + marker.length).split('/')[0],
    );
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
    if (
      conclusion === 'success' ||
      conclusion === 'neutral' ||
      conclusion === 'skipped'
    ) {
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
  if (record?.state === 'failure' || record?.state === 'error')
    return 'failure';
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
    status === 'created' ||
    status === 'waiting_for_resource' ||
    status === 'preparing' ||
    status === 'pending' ||
    status === 'running' ||
    status === 'scheduled'
  ) {
    return 'pending';
  }
  if (
    status === 'failed' ||
    status === 'canceled' ||
    status === 'cancelled' ||
    status === 'manual'
  ) {
    return 'failure';
  }
  return 'unknown';
}

function checkStatus(run: Record<string, unknown>): GitPullRequestCiStatus {
  if (run.status !== 'completed') return 'pending';
  const conclusion = run.conclusion;
  if (
    conclusion === 'success' ||
    conclusion === 'neutral' ||
    conclusion === 'skipped'
  ) {
    return 'success';
  }
  if (conclusion === null || conclusion === undefined) return 'pending';
  return 'failure';
}

function githubChecks(payload: unknown): GitPullRequestCheck[] {
  const record = asRecord(payload);
  const runs = Array.isArray(record?.check_runs) ? record.check_runs : [];
  const checks: GitPullRequestCheck[] = [];

  for (const rawRun of runs) {
    const run = asRecord(rawRun);
    const name = run?.name;
    if (!run || typeof name !== 'string' || name.length === 0) continue;
    const detailsUrl = run.details_url;
    checks.push({
      name,
      status: checkStatus(run),
      ...(typeof detailsUrl === 'string' && detailsUrl.length > 0
        ? { detailsUrl }
        : {}),
    });
  }

  return checks;
}

function githubRequestedReviewers(payload: Record<string, unknown>): string[] {
  const reviewers = Array.isArray(payload.requested_reviewers)
    ? payload.requested_reviewers
    : [];
  return reviewers
    .map((reviewer) => asRecord(reviewer)?.login)
    .filter(
      (login): login is string => typeof login === 'string' && login.length > 0,
    );
}

function githubReviewState(
  payload: unknown,
  requestedReviewers: string[],
): GitPullRequestReviewState {
  const reviews = Array.isArray(payload) ? payload : [];
  const latestStateByReviewer = new Map<string, string>();

  reviews.forEach((rawReview, index) => {
    const review = asRecord(rawReview);
    const state = review?.state;
    if (typeof state !== 'string') return;

    const login = asRecord(review?.user)?.login;
    const reviewer =
      typeof login === 'string' && login.length > 0
        ? login
        : `anonymous-${index}`;
    latestStateByReviewer.set(reviewer, state);
  });

  const states = [...latestStateByReviewer.values()];
  if (states.includes('CHANGES_REQUESTED')) return 'changes-requested';
  if (requestedReviewers.length > 0) return 'review-required';
  if (states.includes('APPROVED')) return 'approved';
  return 'unknown';
}

function remoteStatusForHttpResponse(
  response: Response,
): GitPullRequestRemoteStatus {
  if (response.status === 401) return 'unauthenticated';
  if (
    response.status === 429 ||
    (response.status === 403 &&
      response.headers.get('x-ratelimit-remaining') === '0')
  ) {
    return 'rate-limited';
  }
  return 'unavailable';
}

export class GitPullRequestStatusService {
  private readonly fetchImpl: typeof fetch;
  private readonly providerCliImpl: ProviderCli;
  private readonly timeoutMs: number;
  private readonly cacheTtlMs: number;
  private readonly cache = new Map<
    string,
    { expiresAt: number; pullRequest: EnrichedPullRequest }
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
  ): Promise<EnrichedPullRequest> {
    const cached = this.cache.get(pullRequest.url);
    if (cached && cached.expiresAt > Date.now()) return cached.pullRequest;

    const enriched =
      pullRequest.provider === 'github'
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
  ): Promise<EnrichedPullRequest> {
    const location = parseGithubLocation(pullRequest.url);
    if (!location) return pullRequest;

    const endpoint = `repos/${location.owner}/${location.repo}/pulls/${location.number}`;
    const detailsResult = await this.githubJson(projectPath, endpoint);
    const detailsRecord = asRecord(detailsResult.data);
    if (!detailsRecord) {
      return {
        ...pullRequest,
        cockpit: {
          remoteStatus: detailsResult.remoteStatus,
          reviewState: 'unknown',
          requestedReviewers: [],
          checks: [],
        },
      };
    }

    const issueComments = asNonNegativeInteger(detailsRecord.comments);
    const reviewComments = asNonNegativeInteger(detailsRecord.review_comments);
    const commentsCount =
      issueComments === undefined && reviewComments === undefined
        ? undefined
        : (issueComments ?? 0) + (reviewComments ?? 0);
    const headSha = asRecord(detailsRecord.head)?.sha;
    const requestedReviewers = githubRequestedReviewers(detailsRecord);

    const [commitStatus, checkRuns, reviews, unresolvedConversationsCount] =
      await Promise.all([
        typeof headSha === 'string'
          ? this.githubJson(
              projectPath,
              `repos/${location.owner}/${location.repo}/commits/${headSha}/status`,
            )
          : Promise.resolve<RemoteJsonResult>({
              data: null,
              remoteStatus: 'unavailable',
            }),
        typeof headSha === 'string'
          ? this.githubJson(
              projectPath,
              `repos/${location.owner}/${location.repo}/commits/${headSha}/check-runs`,
            )
          : Promise.resolve<RemoteJsonResult>({
              data: null,
              remoteStatus: 'unavailable',
            }),
        this.githubJson(
          projectPath,
          `repos/${location.owner}/${location.repo}/pulls/${location.number}/reviews`,
        ),
        (reviewComments ?? 0) > 0
          ? this.githubUnresolvedConversations(projectPath, location)
          : Promise.resolve(0),
      ]);

    const ciStatus = combineCiStatuses([
      githubCommitStatus(commitStatus.data),
      githubCheckRunStatus(checkRuns.data),
    ]);
    const checks = githubChecks(checkRuns.data);
    const reviewState = githubReviewState(reviews.data, requestedReviewers);
    const mergeable = detailsRecord.mergeable;
    const mergeableState = detailsRecord.mergeable_state;
    const draft = detailsRecord.draft;

    const cockpit: GitPullRequestCockpit = {
      remoteStatus: 'available',
      ...(typeof headSha === 'string' ? { headSha } : {}),
      ...(typeof draft === 'boolean' ? { draft } : {}),
      ...(typeof mergeable === 'boolean' || mergeable === null
        ? { mergeable: mergeable as boolean | null }
        : {}),
      ...(typeof mergeableState === 'string' ? { mergeableState } : {}),
      reviewState,
      requestedReviewers,
      checks,
    };

    return {
      ...pullRequest,
      cockpit,
      ...(ciStatus !== 'unknown' ? { ciStatus } : {}),
      ...(commentsCount !== undefined ? { commentsCount } : {}),
      ...(unresolvedConversationsCount !== null
        ? { unresolvedConversationsCount }
        : {}),
    };
  }

  private async enrichGitlab(
    pullRequest: GitOpenPullRequest,
  ): Promise<EnrichedPullRequest> {
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
  ): Promise<RemoteJsonResult> {
    const publicResult = await this.fetchGithubJson(
      new URL(`https://api.github.com/${endpoint}`),
      {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'dev-dashboard',
      },
    );
    if (publicResult.data !== null) return publicResult;

    const output = await this.providerCliImpl(
      'gh',
      ['api', '--hostname', 'github.com', endpoint],
      projectPath,
    );
    if (!output) return publicResult;
    try {
      return {
        data: JSON.parse(output) as unknown,
        remoteStatus: 'available',
      };
    } catch {
      return publicResult;
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
      const nodes = Array.isArray(reviewThreads?.nodes)
        ? reviewThreads.nodes
        : null;
      if (!nodes) return null;
      return nodes.filter((node) => asRecord(node)?.isResolved === false)
        .length;
    } catch {
      return null;
    }
  }

  private async fetchGithubJson(
    url: URL,
    headers: Record<string, string>,
  ): Promise<RemoteJsonResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });
      if (!response.ok) {
        return {
          data: null,
          remoteStatus: remoteStatusForHttpResponse(response),
        };
      }
      return {
        data: (await response.json()) as unknown,
        remoteStatus: 'available',
      };
    } catch {
      return { data: null, remoteStatus: 'unavailable' };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async fetchJson(
    url: URL,
    headers: Record<string, string>,
  ): Promise<unknown | null> {
    const result = await this.fetchGithubJson(url, headers);
    return result.data;
  }
}
