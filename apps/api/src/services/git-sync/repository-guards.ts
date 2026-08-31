import type { GitSyncStrategy } from '@dev-dashboard/contracts';

import { GitSyncError } from './errors.js';
import { runGit } from './run.js';

export async function requireRepository(projectPath: string): Promise<void> {
  try {
    await runGit(projectPath, ['rev-parse', '--is-inside-work-tree']);
  } catch {
    throw new GitSyncError(
      'GIT_NOT_REPOSITORY',
      'O projeto não é um repositório Git.',
    );
  }
}

export async function requireRemoteReference(
  projectPath: string,
  reference: string,
): Promise<void> {
  try {
    await runGit(projectPath, [
      'show-ref',
      '--verify',
      '--quiet',
      `refs/remotes/${reference}`,
    ]);
  } catch {
    throw new GitSyncError(
      'GIT_REFERENCE_NOT_FOUND',
      `A referência remota "${reference}" não foi encontrada. Execute fetch antes de continuar.`,
    );
  }
}

export async function hasRemote(
  projectPath: string,
  remote: 'origin' | 'upstream',
): Promise<boolean> {
  try {
    await runGit(projectPath, ['remote', 'get-url', remote]);
    return true;
  } catch {
    return false;
  }
}

export async function requireRemote(
  projectPath: string,
  remote: 'origin' | 'upstream',
): Promise<void> {
  if (!(await hasRemote(projectPath, remote))) {
    throw new GitSyncError(
      'GIT_REMOTE_NOT_CONFIGURED',
      `O remote "${remote}" não está configurado neste projeto.`,
    );
  }
}

export async function requireLocalMain(projectPath: string): Promise<void> {
  try {
    await runGit(projectPath, [
      'show-ref',
      '--verify',
      '--quiet',
      'refs/heads/main',
    ]);
  } catch {
    throw new GitSyncError(
      'GIT_BRANCH_NOT_FOUND',
      'A branch local "main" não foi encontrada.',
    );
  }
}

export async function optionalReferenceHead(
  projectPath: string,
  reference: string,
): Promise<string | undefined> {
  try {
    return await runGit(projectPath, ['rev-parse', reference]);
  } catch {
    return undefined;
  }
}

export async function requireCleanWorkingTree(
  projectPath: string,
): Promise<void> {
  const output = await runGit(projectPath, [
    'status',
    '--porcelain=v2',
    '-z',
    '--untracked-files=all',
  ]);
  const dirty = output
    .split('\0')
    .some(
      (record) =>
        record.startsWith('1 ') ||
        record.startsWith('2 ') ||
        record.startsWith('u ') ||
        record.startsWith('? '),
    );
  if (dirty) {
    throw new GitSyncError(
      'GIT_WORKING_TREE_DIRTY',
      'A árvore de trabalho precisa estar limpa para integrar uma referência remota.',
    );
  }
}

export async function currentBranch(projectPath: string): Promise<string> {
  const branch = await runGit(projectPath, ['branch', '--show-current']);
  if (!branch) {
    throw new GitSyncError(
      'GIT_DETACHED_HEAD',
      'Não é possível sincronizar um HEAD destacado.',
    );
  }
  return branch;
}

export async function abortOperation(
  projectPath: string,
  strategy: GitSyncStrategy,
): Promise<void> {
  try {
    if (strategy === 'rebase') {
      await runGit(projectPath, ['rebase', '--abort']);
    } else if (strategy === 'merge') {
      await runGit(projectPath, ['merge', '--abort']);
    }
  } catch {
    // A operação pode falhar antes de criar estado abortável.
  }
}
