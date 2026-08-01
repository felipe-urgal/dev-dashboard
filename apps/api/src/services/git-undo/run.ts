import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function runGit(
  projectPath: string,
  args: readonly string[],
): Promise<string> {
  const result = await execFileAsync('git', [...args], {
    cwd: projectPath,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true,
    env: {
      ...process.env,
      GIT_OPTIONAL_LOCKS: '0',
      LC_ALL: 'C',
    },
  });
  return result.stdout;
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
