import { execFile } from 'node:child_process';

import type { Project } from '@dev-dashboard/contracts';

export interface DeploymentOriginRevisionResolver {
  resolve(project: Project, branch: string): Promise<string | undefined>;
}

function showRef(cwd: string, ref: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    execFile(
      'git',
      ['show-ref', '--verify', '--hash', ref],
      {
        cwd,
        encoding: 'utf8',
        maxBuffer: 64 * 1024,
        shell: false,
      },
      (error, stdout) => {
        if (error) {
          resolve(undefined);
          return;
        }

        const revision = stdout.trim();
        resolve(/^[0-9a-f]{40}$/i.test(revision) ? revision : undefined);
      },
    );
  });
}

export class GitDeploymentOriginRevisionResolver
  implements DeploymentOriginRevisionResolver
{
  public resolve(project: Project, branch: string): Promise<string | undefined> {
    return showRef(project.path, `refs/remotes/origin/${branch}`);
  }
}
