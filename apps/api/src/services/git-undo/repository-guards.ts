import { GitUndoError } from './errors.js';
import { optionalGit, runGit } from './run.js';

export async function requireRepository(projectPath: string): Promise<void> {
  try {
    await runGit(projectPath, ['rev-parse', '--is-inside-work-tree']);
  } catch {
    throw new GitUndoError(
      'GIT_NOT_REPOSITORY',
      'O projeto não é um repositório Git.',
    );
  }
}

export async function currentBranch(projectPath: string): Promise<string> {
  const branch = (
    await runGit(projectPath, ['branch', '--show-current'])
  ).trim();
  if (!branch) {
    throw new GitUndoError(
      'GIT_DETACHED_HEAD',
      'Não é possível desfazer um commit em HEAD destacado.',
    );
  }
  return branch;
}

export async function assertWorkingTreeClean(
  projectPath: string,
): Promise<void> {
  const status = await runGit(projectPath, [
    'status',
    '--porcelain=v2',
    '-z',
    '--untracked-files=all',
  ]);
  if (status.length > 0) {
    throw new GitUndoError(
      'GIT_WORKING_TREE_DIRTY',
      'Desfaça ou registre as alterações atuais antes de desfazer um commit.',
    );
  }
}

export async function localAheadOfUpstream(
  projectPath: string,
): Promise<number | null> {
  const upstream = await optionalGit(projectPath, [
    'rev-parse',
    '--abbrev-ref',
    '--symbolic-full-name',
    '@{upstream}',
  ]);
  if (!upstream?.trim()) return null;

  const counts = await optionalGit(projectPath, [
    'rev-list',
    '--left-right',
    '--count',
    'HEAD...@{upstream}',
  ]);
  if (!counts) return null;
  const [aheadRaw = '0'] = counts.trim().split(/\s+/);
  return Number.parseInt(aheadRaw, 10) || 0;
}
