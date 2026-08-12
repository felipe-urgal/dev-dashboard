import type {
  GitOpenPullRequest,
  GitPullRequestLookup,
  GitPullRequestUrl,
} from '@dev-dashboard/contracts';

import {
  currentBranch,
  defaultBranch,
  publishedReference,
  remoteUrl,
  requireBaseBranch,
  requireRepository,
} from './git-pull-request/branch-context.js';
import type {
  GitPullRequestTargetRemote,
  ResolvedPullRequestContext,
} from './git-pull-request/context.js';
import { GitPullRequestError } from './git-pull-request/errors.js';
import {
  asRecord,
  githubLookupFromPayload,
  githubRepositoryParts,
} from './git-pull-request/github-lookup-payload.js';
import {
  detectProvider,
  parseRemoteUrl,
} from './git-pull-request/remote-parsing.js';
import { runProviderCli } from './git-pull-request/run.js';
import {
  composeGithubUrl,
  composeGitlabUrl,
} from './git-pull-request/url-compose.js';
import { optionalGit, runGit } from './git-pull-request/run.js';

export type { GitPullRequestTargetRemote } from './git-pull-request/context.js';
export { GitPullRequestError } from './git-pull-request/errors.js';
export type { GitPullRequestErrorCode } from './git-pull-request/errors.js';

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

export interface GitPullRequestReviewDiff {
  targetRemote: GitPullRequestTargetRemote;
  baseBranch: string;
  sourceBranch: string;
  files: string[];
  diff: string;
}

/**
 * A revisão compara apenas a branch local com a branch base. Ao contrário de
 * uma Pull Request, ela não depende da branch atual já ter sido publicada.
 */
interface ResolvedReviewContext {
  projectPath: string;
  branch: string;
  targetRemote: GitPullRequestTargetRemote;
  baseBranch: string;
  sourceBranch: string;
}

export interface GitPullRequestServiceOptions {
  fetchImpl?: typeof fetch;
  lookupTimeoutMs?: number;
  lookupCacheTtlMs?: number;
  providerCliImpl?: (
    command: string,
    args: readonly string[],
    cwd: string,
  ) => Promise<string | null>;
}

export class GitPullRequestService {
  private readonly fetchImpl: typeof fetch;
  private readonly lookupTimeoutMs: number;
  private readonly lookupCacheTtlMs: number;
  private readonly providerCliImpl: NonNullable<
    GitPullRequestServiceOptions['providerCliImpl']
  >;
  private readonly lookupCache = new Map<
    string,
    { expiresAt: number; result: GitPullRequestLookup }
  >();

  public constructor(options: GitPullRequestServiceOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.lookupTimeoutMs = options.lookupTimeoutMs ?? 5_000;
    this.lookupCacheTtlMs = options.lookupCacheTtlMs ?? 30_000;
    this.providerCliImpl = options.providerCliImpl ?? runProviderCli;
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
      url:
        context.provider === 'github'
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

    const result =
      context.provider === 'github'
        ? await this.lookupGithub(context)
        : await this.lookupGitlab(context);
    this.lookupCache.set(cacheKey, {
      expiresAt: Date.now() + this.lookupCacheTtlMs,
      result,
    });
    return result;
  }

  /**
   * Retorna o patch que uma Pull Request efetivamente compararia: merge-base da
   * branch base contra HEAD. A mesma validação de destino/base usada ao abrir a
   * PR mantém a revisão coerente com a escolha feita na interface.
   */
  public async getReviewDiff(
    projectPath: string,
    options: GitPullRequestLookupOptions,
  ): Promise<GitPullRequestReviewDiff> {
    const context = await this.resolveReviewContext(projectPath, options);
    const reviewFiles = await this.reviewFilesForContext(context);
    const diff = await this.diffForContext(context);
    return { ...reviewFiles, diff };
  }

  private async reviewFilesForContext(
    context: ResolvedReviewContext,
  ): Promise<Omit<GitPullRequestReviewDiff, 'diff'>> {
    const remoteReference = `refs/remotes/${context.targetRemote}/${context.baseBranch}`;
    const hasRemoteReference = await optionalGit(context.projectPath, [
      'rev-parse',
      '--verify',
      '--quiet',
      remoteReference,
    ]);
    // O origin pode expor a base apenas como branch local em repositórios
    // recém-criados. A validação anterior já garante que uma das referências
    // existe; aqui escolhemos a remota quando ela estiver disponível.
    const baseReference = hasRemoteReference
      ? remoteReference
      : `refs/heads/${context.baseBranch}`;
    const changedFiles = await runGit(context.projectPath, [
      'diff',
      '--no-ext-diff',
      '--name-only',
      `${baseReference}...HEAD`,
    ]);
    return {
      targetRemote: context.targetRemote,
      baseBranch: context.baseBranch,
      sourceBranch: context.sourceBranch,
      files: changedFiles.split('\n').filter(Boolean),
    };
  }

  private async diffForContext(
    context: ResolvedReviewContext,
    filePath?: string,
  ): Promise<string> {
    const remoteReference = `refs/remotes/${context.targetRemote}/${context.baseBranch}`;
    const hasRemoteReference = await optionalGit(context.projectPath, [
      'rev-parse',
      '--verify',
      '--quiet',
      remoteReference,
    ]);
    const baseReference = hasRemoteReference
      ? remoteReference
      : `refs/heads/${context.baseBranch}`;
    return runGit(context.projectPath, [
      'diff',
      '--no-ext-diff',
      '--find-renames',
      '--unified=3',
      `${baseReference}...HEAD`,
      ...(filePath ? ['--', filePath] : []),
    ]);
  }

  private async resolveReviewContext(
    projectPath: string,
    options: GitPullRequestLookupOptions,
  ): Promise<ResolvedReviewContext> {
    await requireRepository(projectPath);
    const branch = await currentBranch(projectPath);
    const targetRemote = options.targetRemote ?? 'origin';
    const baseBranch =
      options.baseBranch?.trim() ||
      (await defaultBranch(projectPath, targetRemote));
    if (options.baseBranch?.trim())
      await requireBaseBranch(projectPath, targetRemote, baseBranch);

    return {
      projectPath,
      branch,
      targetRemote,
      baseBranch,
      sourceBranch: branch,
    };
  }

  private async resolveContext(
    projectPath: string,
    options: GitPullRequestLookupOptions,
  ): Promise<ResolvedPullRequestContext> {
    await requireRepository(projectPath);
    const branch = await currentBranch(projectPath);
    const targetRemote = options.targetRemote ?? 'origin';
    const baseBranch =
      options.baseBranch?.trim() ||
      (await defaultBranch(projectPath, targetRemote));
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
    const sourceRemote =
      separator > 0 ? published.slice(0, separator) : 'origin';
    const sourceBranch =
      separator > 0 ? published.slice(separator + 1) : branch;

    const [sourceRemoteUrl, targetRemoteUrl] = await Promise.all([
      remoteUrl(projectPath, sourceRemote),
      remoteUrl(projectPath, targetRemote),
    ]);
    const source = parseRemoteUrl(sourceRemoteUrl);
    const target = parseRemoteUrl(targetRemoteUrl);
    const sourceProvider = source ? detectProvider(source.host) : null;
    const provider = target ? detectProvider(target.host) : null;

    if (
      !source ||
      !target ||
      !sourceProvider ||
      !provider ||
      sourceProvider !== provider
    ) {
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
      projectPath,
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
      context.target.host.toLowerCase() !== 'github.com' ||
      context.source.host.toLowerCase() !== 'github.com'
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
    if (response?.ok) {
      try {
        const lookup = githubLookupFromPayload(
          (await response.json()) as unknown,
          context,
        );
        if (lookup) return lookup;
      } catch {
        // Se a API pública não puder ser lida, tenta a sessão autenticada do gh.
      }
    }

    return this.lookupGithubWithCli(
      context,
      targetOwner,
      targetRepo,
      sourceOwner,
    );
  }

  private async lookupGithubWithCli(
    context: ResolvedPullRequestContext,
    targetOwner: string,
    targetRepo: string,
    sourceOwner: string,
  ): Promise<GitPullRequestLookup> {
    const output = await this.providerCliImpl(
      'gh',
      [
        'api',
        '--hostname',
        'github.com',
        '--method',
        'GET',
        `repos/${targetOwner}/${targetRepo}/pulls`,
        '-f',
        'state=open',
        '-f',
        `head=${sourceOwner}:${context.sourceBranch}`,
        '-f',
        `base=${context.baseBranch}`,
        '-f',
        'per_page=1',
      ],
      context.projectPath,
    );
    if (!output) return { checked: false };

    try {
      return (
        githubLookupFromPayload(JSON.parse(output) as unknown, context) ?? {
          checked: false,
        }
      );
    } catch {
      return { checked: false };
    }
  }

  private async lookupGitlab(
    context: ResolvedPullRequestContext,
  ): Promise<GitPullRequestLookup> {
    if (
      context.target.host.toLowerCase() !== 'gitlab.com' ||
      context.source.host.toLowerCase() !== 'gitlab.com' ||
      context.target.ownerRepo !== context.source.ownerRepo
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
      const payload = (await response.json()) as unknown;
      if (!Array.isArray(payload)) return { checked: false };
      if (payload.length === 0) return { checked: true };
      const item = asRecord(payload[0]);
      const number = item?.iid;
      const title = item?.title;
      const webUrl = item?.web_url;
      if (
        typeof number !== 'number' ||
        typeof title !== 'string' ||
        typeof webUrl !== 'string'
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
