import { execFile } from 'node:child_process';

import type { Project } from '@dev-dashboard/contracts';

import { DeploymentError } from './errors.js';

export interface DeploymentRevision {
  revision: string;
  branch: string;
}

export interface DeploymentRevisionResolver {
  resolve(project: Project): Promise<DeploymentRevision>;
}

function runGit(cwd: string, args: readonly string[]): Promise<string> {
  return new Promise((resolve, reject) => {
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
        if (error) {
          reject(error);
          return;
        }
        resolve(stdout.trim());
      },
    );
  });
}

export class GitDeploymentRevisionResolver
  implements DeploymentRevisionResolver
{
  public async resolve(project: Project): Promise<DeploymentRevision> {
    try {
      const [revision, branch] = await Promise.all([
        runGit(project.path, ['rev-parse', 'HEAD']),
        runGit(project.path, ['branch', '--show-current']),
      ]);

      if (!/^[0-9a-f]{40}$/i.test(revision) || branch.length === 0) {
        throw new Error('Revisão Git inválida ou HEAD destacado.');
      }

      return { revision, branch };
    } catch {
      throw new DeploymentError(
        'DEPLOYMENT_REVISION_UNAVAILABLE',
        'Não foi possível resolver branch e revisão Git do projeto.',
      );
    }
  }
}
