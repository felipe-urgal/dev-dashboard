import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type { GitPullRequestProvider, GitPullRequestUrl } from '@dev-dashboard/contracts';

const execFileAsync = promisify(execFile);

export type GitPullRequestTargetRemote = 'origin' | 'upstream';

export interface GitPullRequestComposeOptions {
  targetRemote?: GitPullRequestTargetRemote;
  baseBranch?: string;
  title?: string;
  description?: string;
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

export class GitPullRequestService {
  public async composeUrl(
    projectPath: string,
    options: GitPullRequestComposeOptions = {},
  ): Promise<GitPullRequestUrl> {
    await requireRepository(projectPath);
    const branch = await currentBranch(projectPath);
    const targetRemote = options.targetRemote ?? 'origin';
    const baseBranchName = options.baseBranch?.trim()
      || await defaultBranch(projectPath, targetRemote);
    if (options.baseBranch?.trim()) {
      await requireBaseBranch(projectPath, targetRemote, baseBranchName);
    }

    if (targetRemote === 'origin' && branch === baseBranchName) {
      throw new GitPullRequestError(
        'GIT_PULL_REQUEST_BRANCH_IS_DEFAULT',
        `Você está na branch principal ("${baseBranchName}"). Troque para uma branch de feature antes de abrir uma Pull Request.`,
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

    if (source.ownerRepo === target.ownerRepo && sourceBranch === baseBranchName) {
      throw new GitPullRequestError(
        'GIT_PULL_REQUEST_BRANCH_IS_DEFAULT',
        `A branch de origem e a branch base são a mesma ("${baseBranchName}"). Escolha outra branch base.`,
      );
    }

    const composeOptions = {
      target,
      source,
      sourceBranch,
      baseBranch: baseBranchName,
      ...(options.title ? { title: options.title } : {}),
      ...(options.description ? { description: options.description } : {}),
    };
    return {
      provider,
      url: provider === 'github'
        ? composeGithubUrl(composeOptions)
        : composeGitlabUrl(composeOptions),
      branch,
      defaultBranch: baseBranchName,
    };
  }
}
