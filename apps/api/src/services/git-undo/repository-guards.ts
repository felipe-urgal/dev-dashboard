import { GitUndoError } from './errors.js';
import { optionalGit, runGit } from './run.js';

export interface GitUndoTrackingComparison {
  reference: string;
  ahead: number;
  behind: number;
}

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

export async function workingTreeClean(projectPath: string): Promise<boolean> {
  const status = await runGit(projectPath, [
    'status',
    '--porcelain=v2',
    '-z',
    '--untracked-files=all',
  ]);
  return status.length === 0;
}

async function trackingReference(
  projectPath: string,
  branch: string,
): Promise<string | null> {
  const upstream = await optionalGit(projectPath, [
    'rev-parse',
    '--abbrev-ref',
    '--symbolic-full-name',
    '@{upstream}',
  ]);
  if (upstream?.trim()) return upstream.trim();

  const originReference = `refs/remotes/origin/${branch}`;
  const originHead = await optionalGit(projectPath, [
    'rev-parse',
    '--verify',
    originReference,
  ]);
  return originHead?.trim() ? `origin/${branch}` : null;
}

export async function undoTrackingComparison(
  projectPath: string,
  branch: string,
): Promise<GitUndoTrackingComparison | null> {
  const reference = await trackingReference(projectPath, branch);
  if (!reference) return null;

  let counts: string;
  try {
    counts = await runGit(projectPath, [
      'rev-list',
      '--left-right',
      '--count',
      `HEAD...${reference}`,
    ]);
  } catch (error) {
    throw new GitUndoError(
      'GIT_COMMAND_FAILED',
      error instanceof Error
        ? error.message
        : 'Não foi possível comparar a branch com o remoto.',
    );
  }

  const [aheadRaw = '0', behindRaw = '0'] = counts.trim().split(/\s+/);
  return {
    reference,
    ahead: Number.parseInt(aheadRaw, 10) || 0,
    behind: Number.parseInt(behindRaw, 10) || 0,
  };
}
