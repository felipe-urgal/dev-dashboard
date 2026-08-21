import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_BUFFER_BYTES = 4 * 1024 * 1024;

export interface RunGitOptions {
  timeoutMs?: number;
  maxBufferBytes?: number;
}

function gitEnvironment(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    GIT_OPTIONAL_LOCKS: '0',
    GIT_TERMINAL_PROMPT: '0',
    GCM_INTERACTIVE: 'Never',
    LC_ALL: 'C',
  };
}

/**
 * Único ponto da API que efetivamente dispara `execFile('git', ...)`. Todo
 * serviço de Git delega aqui (direto ou via um wrapper fino de
 * trim/maxBuffer) para garantir as mesmas variáveis de ambiente em todo
 * lugar — em especial `GIT_TERMINAL_PROMPT`/`GCM_INTERACTIVE`, sem as quais
 * um `git pull`/`push` sem credencial configurada pode ficar esperando um
 * prompt interativo que nunca chega e travar o processo da API.
 */
export async function runGit(
  projectPath: string,
  args: readonly string[],
  options: RunGitOptions = {},
): Promise<string> {
  const result = await execFileAsync('git', [...args], {
    cwd: projectPath,
    encoding: 'utf8',
    maxBuffer: options.maxBufferBytes ?? DEFAULT_MAX_BUFFER_BYTES,
    windowsHide: true,
    timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    env: gitEnvironment(),
  });
  return result.stdout;
}

/** Mesmas garantias de `runGit`, preservando bytes para blobs binários. */
export async function runGitBuffer(
  projectPath: string,
  args: readonly string[],
  options: RunGitOptions = {},
): Promise<Buffer> {
  const result = await execFileAsync('git', [...args], {
    cwd: projectPath,
    encoding: 'buffer',
    maxBuffer: options.maxBufferBytes ?? DEFAULT_MAX_BUFFER_BYTES,
    windowsHide: true,
    timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    env: gitEnvironment(),
  });
  return Buffer.isBuffer(result.stdout)
    ? result.stdout
    : Buffer.from(result.stdout);
}

export async function optionalGit(
  projectPath: string,
  args: readonly string[],
  options?: RunGitOptions,
): Promise<string | null> {
  try {
    return await runGit(projectPath, args, options);
  } catch {
    return null;
  }
}

export function commandFailureText(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const withOutput = error as Error & { stdout?: string; stderr?: string };
  return [withOutput.message, withOutput.stdout, withOutput.stderr]
    .filter(Boolean)
    .join('\n');
}

export async function runProviderCli(
  command: string,
  args: readonly string[],
  cwd: string,
): Promise<string | null> {
  try {
    const result = await execFileAsync(command, [...args], {
      cwd,
      encoding: 'utf8',
      maxBuffer: 2 * 1024 * 1024,
      windowsHide: true,
      env: {
        ...process.env,
        LC_ALL: 'C',
      },
    });
    return result.stdout.trim();
  } catch {
    return null;
  }
}
