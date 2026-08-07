import {
  commandFailureText,
  runGit as sharedRunGit,
} from '../shared/run-git.js';

export async function runGit(
  projectPath: string,
  args: readonly string[],
): Promise<string> {
  return (await sharedRunGit(projectPath, args)).trim();
}

export const failureText = commandFailureText;
