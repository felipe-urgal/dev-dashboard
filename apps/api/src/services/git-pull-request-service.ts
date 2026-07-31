import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type {
  GitOpenPullRequest,
  GitPullRequestLookup,
  GitPullRequestProvider,
  GitPullRequestUrl,
} from '@dev-dashboard/contracts';

const execFileAsync = promisify(execFile);

export type GitPullRequestTargetRemote = 'origin' | 'upstream';

export interface GitPullRequestComposeOptions {
  targetRemote?: GitPullRequestTargetRemote;
  baseBranch?: string;
  title?: string;
  description?: string;
}

export interface GitPullRequestLookupOptions {
  targetRemote?: GitPullRequestTargetRemote;
  baseBranch?: string;
}

export interface GitPullRequestServiceOptions {
  fetchImpl?: typeof fetch;
  lookupTimeoutMs?: number;
  lookupCacheTtlMs?: number;
}

export type GitPullRequestErrorCode =
  | 'GIT_NOT_REPOSITORY'
  | 'GIT_DETACHED_HEAD'
  | 'GIT_REMOTE_NOT_CONFIGURED'
  | 'GIT_PULL_REQUEST_NOT_PUBLISHED'
  | 'GIT_PULL_REQUEST_BRANCH_IS_DEFAULT'
  | 'GIT_PULL_REQUEST_REMOTE_UNSUPPORTED'
  | 'GIT_PULL_REQUEST_BASE_NOT_FOUND';

export class GitPullRequestError extends Error {
  public constructor(
    public readonly code: GitPullRequestErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'GitPullRequestError';
  }
}

async function runGit(projectPath: string, args: readonly string[]): Promise<string> {
  const result = await execFileAsync('git', [...args], {
    cwd: projectPath,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true,
    env: {
      ...process.env,
      GIT_OPTIONAL_LOCKS: '0',
      LC_ALL: 'C',
    },
  });
  return result.stdout.trim();
}

async function optionalGit(projectPath: string, args: readonly string[]): Promise<string | null> {
  try {
    return await runGit(projectPath, args);
  } catch {
    return null;
  }
}

async function requireRepository(projectPath: string): Promise<void> {
  try {
    await runGit(projectPath, ['rev-parse', '--is-inside-work-tree']);
  } catch {
    throw new GitPullRequestError('GIT_NOT_REPOSITORY', 'O projeto não é um repositório Git.');
  }
}

async function currentBranch(projectPath: string): Promise<string> {
  const branch = await runGit(projectPath, ['branch', '--show-current']);
  if (!branch) {
    throw new GitPullRequestError('GIT_DETACHED_HEAD', 'Não é possível compor a URL da Pull Request em um HEAD destacado.');
  }
  return branch;
}

async function publishedReference(projectPath: string, branch: string): Promise<string> {
  try {
    return await runGit(projectPath, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
  } catch {
    throw new GitPullRequestError(
      'GIT_PULL_REQUEST_NOT_PUBLISHED',
      `A branch "${branch}" ainda não foi publicada em um remoto. Publique-a antes de abrir a Pull Request.`,
    );
  }
}

async function remoteUrl(projectPath: string, remote: string): Promise<string> {
  try {
    return await runGit(projectPath, ['remote', 'get-url', remote]);
  } catch {
    throw new GitPullRequestError(
      'GIT_REMOTE_NOT_CONFIGURED',
      `Nenhum remoto "${remote}" configurado para este projeto.`,
    );
  }
}

async function defaultBranch(projectPath: string, remote: string): Promise<string> {
  try {
    const ref = await runGit(projectPath, [
      'symbolic-ref',
      '--quiet',
      '--short',
      `refs/remotes/${remote}/HEAD`,
    ]);
    if (ref) return ref.replace(new RegExp(`^${remote}/`), '');
  } catch {
    // Ausência de refs/remotes/<remote>/HEAD é comum; cai nos fallbacks.
  }

  for (const candidate of ['main', 'master', 'develop']) {
    const remoteRef = await optionalGit(projectPath, [
      'show-ref', '--verify', '--quiet', `refs/remotes/${remote}/${candidate}`,
    ]);
    if (remoteRef !== null) return candidate;

    const localRef = await optionalGit(projectPath, [
      'show-ref', '--verify', '--quiet', `refs/heads/${candidate}`,
    ]);
    if (localRef !== null) return candidate;
  }
  return 'main';
}

async function requireBaseBranch(
  projectPath: string,
  remote: string,
  branch: string,
): Promise<void> {
  const remoteRef = await optionalGit(projectPath, [
    'show-ref', '--verify', '--quiet', `refs/remotes/${remote}/${branch}`,
  ]);
  if (remoteRef !== null) return;

  if (remote === 'origin') {
    const localRef = await optionalGit(projectPath, [
      'show-ref', '--verify', '--quiet', `refs/heads/${branch}`,
    ]);
    if (localRef !== null) return;
  }

  throw new GitPullRequestError(
    'GIT_PULL_REQUEST_BASE_NOT_FOUND',
    `A branch base "${remote}/${branch}" não foi encontrada. Atualize os remotos e tente novamente.`,
  );
}

interface ParsedRemote {
  host: string;
  ownerRepo: string;
}

interface ResolvedPullRequestContext {
  branch: string;
  targetRemote: GitPullRequestTargetRemote;
  baseBranch: string;
  sourceBranch: string;
  source: ParsedRemote;
  target: ParsedRemote;
  provider: GitPullRequestProvider;
}

function parseRemoteUrl(remoteUrl: string): ParsedRemote | null {
  const trimmed = remoteUrl.trim();
  if (!trimmed) return null;

  const scpMatch = /^(?:[^@/]+@)?([^:/]+):(.+)$/.exec(trimmed);
  if (!trimmed.includes('://') && scpMatch) {
    const [, host, ownerRepoRaw] = scpMatch;
    if (!host || !ownerRepoRaw) return null;
    return { host, ownerRepo: ownerRepoRaw.replace(/\.git$/, '').replace(/^\/+/, '') };
  }

  try {
    const url = new URL(trimmed);
    const ownerRepo = url.pathname.replace(/^\/+/, '').replace(/\.git$/, '');
    if (!url.hostname || !ownerRepo) return null;
    return { host: url.hostname, ownerRepo };
  } catch {
    return null;
  }
}

function detectProvider(host: string): GitPullRequestProvider | null {
  const normalized = host.toLowerCase();
  if (normalized === 'github.com' || normalized.endsWith('.github.com')) return 'github';
  if (normalized === 'gitlab.com' || normalized.includes('gitlab')) return 'gitlab';
  return null;
}

function composeGithubUrl(options: {
  target: ParsedRemote;
  source: ParsedRemote;
  sourceBranch: string;
  baseBranch: string;
  title?: string;
  description?: string;
}): string {
  const sameRepository = options.target.ownerRepo === options.source.ownerRepo;
  const sourceOwner = options.source.ownerRepo.split('/')[0] ?? '';
  const head = sameRepository
    ? options.sourceBranch
    : `${sourceOwner}:${options.sourceBranch}`;
  const params = new URLSearchParams({ quick_pull: '1' });
  if (options.title?.trim()) params.set('title', options.title.trim());
  if (options.description?.trim()) params.set('body', options.description.trim());
  return `https://${options.target.host}/${options.target.ownerRepo}/compare/${encodeURIComponent(options.baseBranch)}...${encodeURIComponent(head)}?${params.toString()}`;
}

function composeGitlabUrl(options: {
  target: ParsedRemote;
  source: ParsedRemote;
  sourceBranch: string;
  baseBranch: string;
  title?: string;
  description?: string;
}): string {
  if (options.target.ownerRepo !== options.source.ownerRepo) {
    throw new GitPullRequestError(
      'GIT_PULL_REQUEST_REMOTE_UNSUPPORTED',
      'Pull Request entre forks diferentes é suportada pelo painel somente no GitHub.',
    );
  }

  const params = new URLSearchParams({
    'merge_request[source_branch]': options.sourceBranch,
    'merge_request[target_branch]': options.baseBranch,
  });
  if (options.title?.trim()) params.set('merge_request[title]', options.title.trim());
  if (options.description?.trim()) {
    params.set('merge_request[description]', options.description.trim());
  }
  return `https://${options.target.host}/${options.target.ownerRepo}/-/merge_requests/new?${params.toString()}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object'
    ? value as Record<string, unknown>
    : null;
}

function githubRepositoryParts(ownerRepo: string): [string, string] | null {
  const parts = ownerRepo.split('/').filter(Boolean);
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return [parts[0], parts[1]];
}

export class GitPullRequestService {
  private readonly fetchImpl: typeof fetch;
  private readonly lookupTimeoutMs: number;
  private readonly lookupCacheTtlMs: number;
  private readonly lookupCache = new Map<
    string,
    { expiresAt: number; result: GitPullRequestLookup }
  >();

  public constructor(options: GitPullRequestServiceOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.lookupTimeoutMs = options.lookupTimeoutMs ?? 5_000;
    this.lookupCacheTtlMs = options.lookupCacheTtlMs ?? 30_000;
  }

  public async composeUrl(
    projectPath: string,
    options: GitPullRequestComposeOptions = {},
  ): Promise<GitPullRequestUrl> {
    const context = await this.resolveContext(projectPath, options);
    const composeOptions = {
      target: context.target,
      source: context.source,
      sourceBranch: context.sourceBranch,
      baseBranch: context.baseBranch,
      ...(options.title ? { title: options.title } : {}),
      ...(options.description ? { description: options.description } : {}),
    };
    return {
      provider: context.provider,
      url: context.provider === 'github'
        ? composeGithubUrl(composeOptions)
        : composeGitlabUrl(composeOptions),
      branch: context.branch,
      defaultBranch: context.baseBranch,
    };
  }

  public async findOpenPullRequest(
    projectPath: string,
    options: GitPullRequestLookupOptions = {},
  ): Promise<GitPullRequestLookup> {
    const context = await this.resolveContext(projectPath, options);
    const cacheKey = [
      context.provider,
      context.target.host,
      context.target.ownerRepo,
      context.source.ownerRepo,
      context.sourceBranch,
      context.baseBranch,
    ].join('|');
    const cached = this.lookupCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.result;

    const result = context.provider === 'github'
      ? await this.lookupGithub(context)
      : await this.lookupGitlab(context);
    this.lookupCache.set(cacheKey, {
      expiresAt: Date.now() + this.lookupCacheTtlMs,
      result,
    });
    return result;
  }

  private async resolveContext(
    projectPath: string,
    options: GitPullRequestLookupOptions,
  ): Promise<ResolvedPullRequestContext> {
    await requireRepository(projectPath);
    const branch = await currentBranch(projectPath);
    const targetRemote = options.targetRemote ?? 'origin';
    const baseBranch = options.baseBranch?.trim()
      || await defaultBranch(projectPath, targetRemote);
    if (options.baseBranch?.trim()) {
      await requireBaseBranch(projectPath, targetRemote, baseBranch);
    }

    if (targetRemote === 'origin' && branch === baseBranch) {
      throw new GitPullRequestError(
        'GIT_PULL_REQUEST_BRANCH_IS_DEFAULT',
        `Você está na branch principal ("${baseBranch}"). Troque para uma branch de feature antes de abrir uma Pull Request.`,
      );
    }

    const published = await publishedReference(projectPath, branch);
    const separator = published.indexOf('/');
    const sourceRemote = separator > 0 ? published.slice(0, separator) : 'origin';
    const sourceBranch = separator > 0 ? published.slice(separator + 1) : branch;

    const [sourceRemoteUrl, targetRemoteUrl] = await Promise.all([
      remoteUrl(projectPath, sourceRemote),
      remoteUrl(projectPath, targetRemote),
    ]);
    const source = parseRemoteUrl(sourceRemoteUrl);
    const target = parseRemoteUrl(targetRemoteUrl);
    const sourceProvider = source ? detectProvider(source.host) : null;
    const provider = target ? detectProvider(target.host) : null;

    if (!source || !target || !sourceProvider || !provider || sourceProvider !== provider) {
      throw new GitPullRequestError(
        'GIT_PULL_REQUEST_REMOTE_UNSUPPORTED',
        'Os remotos de origem e destino precisam ser repositórios GitHub ou GitLab compatíveis.',
      );
    }

    if (source.ownerRepo === target.ownerRepo && sourceBranch === baseBranch) {
      throw new GitPullRequestError(
        'GIT_PULL_REQUEST_BRANCH_IS_DEFAULT',
        `A branch de origem e a branch base são a mesma ("${baseBranch}"). Escolha outra branch base.`,
      );
    }

    return {
      branch,
      targetRemote,
      baseBranch,
      sourceBranch,
      source,
      target,
      provider,
    };
  }

  private async lookupGithub(
    context: ResolvedPullRequestContext,
  ): Promise<GitPullRequestLookup> {
    if (
      context.target.host.toLowerCase() !== 'github.com'
      || context.source.host.toLowerCase() !== 'github.com'
    ) {
      return { checked: false };
    }

    const targetRepository = githubRepositoryParts(context.target.ownerRepo);
    const sourceOwner = githubRepositoryParts(context.source.ownerRepo)?.[0];
    if (!targetRepository || !sourceOwner) return { checked: false };

    const [targetOwner, targetRepo] = targetRepository;
    const url = new URL(
      `https://api.github.com/repos/${encodeURIComponent(targetOwner)}/${encodeURIComponent(targetRepo)}/pulls`,
    );
    url.searchParams.set('state', 'open');
    url.searchParams.set('head', `${sourceOwner}:${context.sourceBranch}`);
    url.searchParams.set('base', context.baseBranch);
    url.searchParams.set('per_page', '1');

    const response = await this.fetchResponse(url, {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'dev-dashboard',
    });
    if (!response?.ok) return { checked: false };

    try {
      const payload = await response.json() as unknown;
      if (!Array.isArray(payload)) return { checked: false };
      if (payload.length === 0) return { checked: true };
      const item = asRecord(payload[0]);
      const number = item?.number;
      const title = item?.title;
      const htmlUrl = item?.html_url;
      if (
        typeof number !== 'number'
        || typeof title !== 'string'
        || typeof htmlUrl !== 'string'
      ) {
        return { checked: false };
      }
      return {
        checked: true,
        existing: {
          provider: 'github',
          number,
          title,
          url: htmlUrl,
          sourceBranch: context.sourceBranch,
          baseBranch: context.baseBranch,
        },
      };
    } catch {
      return { checked: false };
    }
  }

  private async lookupGitlab(
    context: ResolvedPullRequestContext,
  ): Promise<GitPullRequestLookup> {
    if (
      context.target.host.toLowerCase() !== 'gitlab.com'
      || context.source.host.toLowerCase() !== 'gitlab.com'
      || context.target.ownerRepo !== context.source.ownerRepo
    ) {
      return { checked: false };
    }

    const url = new URL(
      `https://gitlab.com/api/v4/projects/${encodeURIComponent(context.target.ownerRepo)}/merge_requests`,
    );
    url.searchParams.set('state', 'opened');
    url.searchParams.set('source_branch', context.sourceBranch);
    url.searchParams.set('target_branch', context.baseBranch);
    url.searchParams.set('per_page', '1');

    const response = await this.fetchResponse(url, {
      Accept: 'application/json',
      'User-Agent': 'dev-dashboard',
    });
    if (!response?.ok) return { checked: false };

    try {
      const payload = await response.json() as unknown;
      if (!Array.isArray(payload)) return { checked: false };
      if (payload.length === 0) return { checked: true };
      const item = asRecord(payload[0]);
      const number = item?.iid;
      const title = item?.title;
      const webUrl = item?.web_url;
      if (
        typeof number !== 'number'
        || typeof title !== 'string'
        || typeof webUrl !== 'string'
      ) {
        return { checked: false };
      }
      const existing: GitOpenPullRequest = {
        provider: 'gitlab',
        number,
        title,
        url: webUrl,
        sourceBranch: context.sourceBranch,
        baseBranch: context.baseBranch,
      };
      return { checked: true, existing };
    } catch {
      return { checked: false };
    }
  }

  private async fetchResponse(
    url: URL,
    headers: Record<string, string>,
  ): Promise<Response | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.lookupTimeoutMs);
    try {
      return await this.fetchImpl(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}
