import { runGit as sharedRunGit } from '../shared/run-git.js';

import { GitCommitDetailsError } from './errors.js';

const MAX_BUFFER_BYTES = 24 * 1024 * 1024;

export async function runGit(
  projectPath: string,
  args: readonly string[],
): Promise<string> {
  return sharedRunGit(projectPath, args, { maxBufferBytes: MAX_BUFFER_BYTES });
}

export async function requireRepository(projectPath: string): Promise<void> {
  try {
    await runGit(projectPath, ['rev-parse', '--is-inside-work-tree']);
  } catch {
    throw new GitCommitDetailsError(
      'GIT_NOT_REPOSITORY',
      'O projeto não é um repositório Git.',
    );
  }
}
