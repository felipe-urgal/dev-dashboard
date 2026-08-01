import { GitStashError } from './errors.js';
import { runGit } from './run.js';

export async function requireRepository(projectPath: string): Promise<void> {
  try {
    await runGit(projectPath, ['rev-parse', '--is-inside-work-tree']);
  } catch {
    throw new GitStashError(
      'GIT_NOT_REPOSITORY',
      'O projeto não é um repositório Git.',
    );
  }
}

export async function requireCleanWorkingTree(projectPath: string): Promise<void> {
  const output = await runGit(projectPath, [
    'status',
    '--porcelain=v2',
    '-z',
    '--untracked-files=all',
  ]);
  if (output.length > 0) {
    throw new GitStashError(
      'GIT_WORKING_TREE_DIRTY',
      'A árvore de trabalho precisa estar limpa para restaurar um stash com segurança.',
    );
  }
}

export async function currentBranch(projectPath: string): Promise<string> {
  const branch = (await runGit(projectPath, ['branch', '--show-current'])).trim();
  return branch || 'HEAD';
}

export async function rollbackWorkingTree(projectPath: string, head: string): Promise<void> {
  try {
    await runGit(projectPath, ['reset', '--hard', head]);
    await runGit(projectPath, ['clean', '-fd']);
  } catch {
    // O erro original da aplicação do stash é mais relevante.
  }
}
