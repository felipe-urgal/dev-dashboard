import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const DEFAULT_GIT_TIMEOUT_MS = 120_000;

export interface RunGitOptions {
  timeoutMs?: number;
}

export async function runGit(
  projectPath: string,
  args: readonly string[],
  options: RunGitOptions = {},
): Promise<string> {
  const result = await execFileAsync('git', [...args], {
    cwd: projectPath,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true,
    timeout: options.timeoutMs ?? DEFAULT_GIT_TIMEOUT_MS,
    env: {
      ...process.env,
      GIT_OPTIONAL_LOCKS: '0',
      GIT_TERMINAL_PROMPT: '0',
      GCM_INTERACTIVE: 'Never',
      LC_ALL: 'C',
    },
  });
  return result.stdout;
}

export function commandFailureText(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const withOutput = error as Error & { stdout?: string; stderr?: string };
  return [withOutput.message, withOutput.stdout, withOutput.stderr]
    .filter(Boolean)
    .join('\n');
}
