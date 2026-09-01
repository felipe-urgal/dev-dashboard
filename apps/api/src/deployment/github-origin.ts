import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type { Project } from '@dev-dashboard/contracts';

import { DeploymentError } from './errors.js';

const execFileAsync = promisify(execFile);

export interface GitHubRepositoryReference {
  owner: string;
  repo: string;
}

export interface GitHubOriginResolver {
  resolve(project: Project): Promise<GitHubRepositoryReference>;
}

type ExecGit = (
  args: readonly string[],
  options: { cwd: string },
) => Promise<{ stdout: string }>;

export interface LocalGitHubOriginResolverOptions {
  execGit?: ExecGit;
}

function parseGitHubRemote(
  value: string,
): GitHubRepositoryReference | undefined {
  const remote = value.trim();
  const scp = remote.match(
    /^git@github\.com:([^/\s]+)\/([^/\s]+?)(?:\.git)?$/i,
  );
  if (scp) return { owner: scp[1]!, repo: scp[2]! };

  try {
    const parsed = new URL(remote);
    if (parsed.hostname.toLowerCase() !== 'github.com') return undefined;
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'ssh:')
      return undefined;
    const [owner, rawRepo, ...rest] = parsed.pathname
      .replace(/^\/+/, '')
      .split('/');
    if (!owner || !rawRepo || rest.length > 0) return undefined;
    const repo = rawRepo.replace(/\.git$/i, '');
    if (!repo) return undefined;
    return { owner, repo };
  } catch {
    return undefined;
  }
}

export class LocalGitHubOriginResolver implements GitHubOriginResolver {
  private readonly execGit: ExecGit;

  public constructor(options: LocalGitHubOriginResolverOptions = {}) {
    this.execGit =
      options.execGit ??
      (async (args, execOptions) =>
        execFileAsync('git', [...args], {
          cwd: execOptions.cwd,
          encoding: 'utf8',
          maxBuffer: 1024 * 1024,
        }));
  }

  public async resolve(project: Project): Promise<GitHubRepositoryReference> {
    let stdout: string;
    try {
      ({ stdout } = await this.execGit(['remote', 'get-url', 'origin'], {
        cwd: project.path,
      }));
    } catch {
      throw new DeploymentError(
        'DEPLOYMENT_PROVIDER_UNAVAILABLE',
        'Não foi possível resolver o remote origin usado para o deploy Vercel.',
      );
    }

    const reference = parseGitHubRemote(stdout);
    if (!reference) {
      throw new DeploymentError(
        'DEPLOYMENT_PROVIDER_UNAVAILABLE',
        'O deploy Vercel git-managed exige um remote origin do GitHub reconhecível.',
      );
    }
    return reference;
  }
}
