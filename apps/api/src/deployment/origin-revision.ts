import { execFile } from 'node:child_process';
import path from 'node:path';

import type { Project } from '@dev-dashboard/contracts';

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_AGENT_TIMEOUT_MS = 15_000;
const MAX_OUTPUT_BYTES = 64 * 1024;

type PrepareAgent = (
  project: Project,
  options: { timeoutMs: number; signal?: AbortSignal },
) => Promise<void>;

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
  agentTimeoutMs?: number;
  execGit?: ExecGit;
  prepareAgent?: PrepareAgent;
}

function parseLsRemote(output: string | undefined): string | undefined {
  const revision = output?.split(/\s+/)[0];
  return revision && /^[0-9a-f]{40}$/i.test(revision) ? revision : undefined;
}

function defaultExecGit(
  args: readonly string[],
  options: { cwd: string; timeoutMs: number; signal?: AbortSignal },
): Promise<{ stdout: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      [...args],
      {
        cwd: options.cwd,
        encoding: 'utf8',
        maxBuffer: MAX_OUTPUT_BYTES,
        shell: false,
        timeout: options.timeoutMs,
        killSignal: 'SIGTERM',
        ...(options.signal ? { signal: options.signal } : {}),
      },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        resolve({ stdout });
      },
    );
  });
}

function defaultPrepareAgent(
  project: Project,
  options: { timeoutMs: number; signal?: AbortSignal },
): Promise<void> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(
      project.path,
      'scripts',
      'self-update-agent-bootstrap.mjs',
    );
    execFile(
      process.execPath,
      [scriptPath, 'ensure'],
      {
        cwd: project.path,
        encoding: 'utf8',
        maxBuffer: MAX_OUTPUT_BYTES,
        shell: false,
        timeout: options.timeoutMs,
        killSignal: 'SIGTERM',
        ...(options.signal ? { signal: options.signal } : {}),
      },
      (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      },
    );
  });
}

export class GitDeploymentOriginRevisionResolver implements DeploymentOriginRevisionResolver {
  private readonly timeoutMs: number;
  private readonly agentTimeoutMs: number;
  private readonly execGit: ExecGit;
  private readonly prepareAgent: PrepareAgent;

  public constructor(options: GitDeploymentOriginRevisionResolverOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.agentTimeoutMs = options.agentTimeoutMs ?? DEFAULT_AGENT_TIMEOUT_MS;
    this.execGit = options.execGit ?? defaultExecGit;
    this.prepareAgent = options.prepareAgent ?? defaultPrepareAgent;
  }

  public async resolve(
    project: Project,
    branch: string,
    signal?: AbortSignal,
  ): Promise<string | undefined> {
    try {
      if (project.production?.strategy === 'self-update') {
        await this.prepareAgent(project, {
          timeoutMs: this.agentTimeoutMs,
          ...(signal ? { signal } : {}),
        });
      }
      const { stdout } = await this.execGit(
        ['ls-remote', '--heads', 'origin', `refs/heads/${branch}`],
        {
          cwd: project.path,
          timeoutMs: this.timeoutMs,
          ...(signal ? { signal } : {}),
        },
      );
      return parseLsRemote(stdout);
    } catch {
      return undefined;
    }
  }
}
