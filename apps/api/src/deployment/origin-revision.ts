import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type { Project } from '@dev-dashboard/contracts';

const execFileAsync = promisify(execFile);
const DEFAULT_TIMEOUT_MS = 10_000;

export interface DeploymentOriginRevisionResolver {
  resolve(
    project: Project,
    branch: string,
    signal?: AbortSignal,
  ): Promise<string | undefined>;
}

type ExecGit = (
  args: readonly string[],
  options: { cwd: string; timeoutMs: number; signal?: AbortSignal },
) => Promise<{ stdout: string }>;

export interface GitDeploymentOriginRevisionResolverOptions {
  timeoutMs?: number;
  execGit?: ExecGit;
}

function parseLsRemote(output: string | undefined): string | undefined {
  const revision = output?.split(/\s+/)[0];
  return revision && /^[0-9a-f]{40}$/i.test(revision) ? revision : undefined;
}

export class GitDeploymentOriginRevisionResolver implements DeploymentOriginRevisionResolver {
  private readonly timeoutMs: number;
  private readonly execGit: ExecGit;

  public constructor(options: GitDeploymentOriginRevisionResolverOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.execGit =
      options.execGit ??
      (async (args, execOptions) =>
        execFileAsync('git', [...args], {
          cwd: execOptions.cwd,
          encoding: 'utf8',
          maxBuffer: 64 * 1024,
          shell: false,
          timeout: execOptions.timeoutMs,
          killSignal: 'SIGTERM',
          ...(execOptions.signal ? { signal: execOptions.signal } : {}),
        }));
  }

  public async resolve(
    project: Project,
    branch: string,
    signal?: AbortSignal,
  ): Promise<string | undefined> {
    try {
      const { stdout } = await this.execGit(
        ['ls-remote', '--heads', 'origin', `refs/heads/${branch}`],
        { cwd: project.path, timeoutMs: this.timeoutMs, signal },
      );
      return parseLsRemote(stdout);
    } catch {
      return undefined;
    }
  }
}
