import { execFile } from 'node:child_process';

import type { Project } from '@dev-dashboard/contracts';

export interface DeploymentOriginRevisionResolver {
  resolve(project: Project, branch: string): Promise<string | undefined>;
}

function gitOutput(
  cwd: string,
  args: readonly string[],
): Promise<string | undefined> {
  return new Promise((resolve) => {
    execFile(
      'git',
      [...args],
      {
        cwd,
        encoding: 'utf8',
        maxBuffer: 64 * 1024,
        shell: false,
      },
      (error, stdout) => {
        resolve(error ? undefined : stdout.trim());
      },
    );
  });
}

function parseLsRemote(output: string | undefined): string | undefined {
  const revision = output?.split(/\s+/)[0];
  return revision && /^[0-9a-f]{40}$/i.test(revision) ? revision : undefined;
}

export class GitDeploymentOriginRevisionResolver implements DeploymentOriginRevisionResolver {
  public async resolve(
    project: Project,
    branch: string,
  ): Promise<string | undefined> {
    // Production decisions must use the live remote. Falling back to the local
    // tracking ref after a network/auth failure could approve a stale revision.
    return parseLsRemote(
      await gitOutput(project.path, [
        'ls-remote',
        '--heads',
        'origin',
        `refs/heads/${branch}`,
      ]),
    );
  }
}
