import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { GitCommitDetailsError } from './errors.js';

const execFileAsync = promisify(execFile);

export async function runGit(projectPath: string, args: readonly string[]): Promise<string> {
  const result = await execFileAsync('git', [...args], {
    cwd: projectPath,
    encoding: 'utf8',
    maxBuffer: 24 * 1024 * 1024,
    windowsHide: true,
    env: {
      ...process.env,
      GIT_OPTIONAL_LOCKS: '0',
      LC_ALL: 'C',
    },
  });
  return result.stdout;
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
