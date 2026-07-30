import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type { GitPullRequestProvider, GitPullRequestUrl } from '@dev-dashboard/contracts';

const execFileAsync = promisify(execFile);

export type GitPullRequestErrorCode =
  | 'GIT_NOT_REPOSITORY'
  | 'GIT_DETACHED_HEAD'
  | 'GIT_REMOTE_NOT_CONFIGURED'
  | 'GIT_PULL_REQUEST_NOT_PUBLISHED'
  | 'GIT_PULL_REQUEST_BRANCH_IS_DEFAULT'
  | 'GIT_PULL_REQUEST_REMOTE_UNSUPPORTED';

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

async function requireUpstream(projectPath: string, branch: string): Promise<void> {
  try {
    await runGit(projectPath, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
  } catch {
    throw new GitPullRequestError(
      'GIT_PULL_REQUEST_NOT_PUBLISHED',
      `A branch "${branch}" ainda não foi publicada em um remoto. Publique-a antes de abrir a Pull Request.`,
    );
  }
}

async function originRemoteUrl(projectPath: string): Promise<string> {
  try {
    return await runGit(projectPath, ['remote', 'get-url', 'origin']);
  } catch {
    throw new GitPullRequestError('GIT_REMOTE_NOT_CONFIGURED', 'Nenhum remoto "origin" configurado para este projeto.');
  }
}

async function defaultBranch(projectPath: string): Promise<string> {
  try {
    const ref = await runGit(projectPath, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']);
    if (ref) return ref.replace(/^origin\//, '');
  } catch {
    // Ausência de refs/remotes/origin/HEAD é comum em clones rasos; cai no fallback abaixo.
  }
  for (const candidate of ['main', 'master', 'develop']) {
    try {
      await runGit(projectPath, ['show-ref', '--verify', '--quiet', `refs/heads/${candidate}`]);
      return candidate;
    } catch {
      // Tenta o próximo candidato.
    }
  }
  return 'main';
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

function composeProviderUrl(
  provider: GitPullRequestProvider,
  host: string,
  ownerRepo: string,
  branch: string,
  defaultBranchName: string,
): string {
  if (provider === 'github') {
    return `https://${host}/${ownerRepo}/compare/${encodeURIComponent(defaultBranchName)}...${encodeURIComponent(branch)}?expand=1`;
  }
  const params = new URLSearchParams({
    'merge_request[source_branch]': branch,
    'merge_request[target_branch]': defaultBranchName,
  });
  return `https://${host}/${ownerRepo}/-/merge_requests/new?${params.toString()}`;
}

export class GitPullRequestService {
  public async composeUrl(projectPath: string): Promise<GitPullRequestUrl> {
    await requireRepository(projectPath);
    const branch = await currentBranch(projectPath);
    const defaultBranchName = await defaultBranch(projectPath);
    if (branch === defaultBranchName) {
      throw new GitPullRequestError(
        'GIT_PULL_REQUEST_BRANCH_IS_DEFAULT',
        `Você está na branch principal ("${defaultBranchName}"). Troque para uma branch de feature antes de abrir uma Pull Request.`,
      );
    }
    await requireUpstream(projectPath, branch);
    const remoteUrl = await originRemoteUrl(projectPath);
    const parsed = parseRemoteUrl(remoteUrl);
    const provider = parsed ? detectProvider(parsed.host) : null;
    if (!parsed || !provider) {
      throw new GitPullRequestError(
        'GIT_PULL_REQUEST_REMOTE_UNSUPPORTED',
        'O remoto "origin" não é um repositório GitHub ou GitLab reconhecido.',
      );
    }
    return {
      provider,
      url: composeProviderUrl(provider, parsed.host, parsed.ownerRepo, branch, defaultBranchName),
      branch,
      defaultBranch: defaultBranchName,
    };
  }
}
