import { runGit as sharedRunGit, runProviderCli } from '../shared/run-git.js';

export { runProviderCli };

export async function runGit(
  projectPath: string,
  args: readonly string[],
): Promise<string> {
  return (await sharedRunGit(projectPath, args)).trim();
}

export async function optionalGit(
  projectPath: string,
  args: readonly string[],
): Promise<string | null> {
  try {
    return await runGit(projectPath, args);
  } catch {
    return null;
  }
}
