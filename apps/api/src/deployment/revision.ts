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

export class GitDeploymentRevisionResolver implements DeploymentRevisionResolver {
  public async resolve(project: Project): Promise<DeploymentRevision> {
    try {
      const [revision, branch, worktreeStatus] = await Promise.all([
        runGit(project.path, ['rev-parse', 'HEAD']),
        runGit(project.path, ['branch', '--show-current']),
        runGit(project.path, [
          'status',
          '--porcelain',
          '--untracked-files=normal',
        ]),
      ]);

      if (!/^[0-9a-f]{40}$/i.test(revision) || branch.length === 0) {
        throw new Error('Revisão Git inválida ou HEAD destacado.');
      }

      if (worktreeStatus.length > 0) {
        throw new DeploymentError(
          'DEPLOYMENT_WORKTREE_DIRTY',
          'A produção exige um working tree limpo; commit ou descarte as alterações locais antes de gerar o plano.',
        );
      }

      return { revision, branch };
    } catch (error) {
      if (error instanceof DeploymentError) throw error;
      throw new DeploymentError(
        'DEPLOYMENT_REVISION_UNAVAILABLE',
        'Não foi possível resolver branch e revisão Git do projeto.',
      );
    }
  }
}
