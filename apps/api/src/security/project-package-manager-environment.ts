import { spawn } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { userInfo } from 'node:os';
import path from 'node:path';

const PACKAGE_MANAGER_CONFIG_FILES = [
  '.npmrc',
  '.yarnrc',
  '.yarnrc.yml',
] as const;
const ENVIRONMENT_REFERENCE_PATTERN = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/gu;
const ENVIRONMENT_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/u;
const MAX_CONFIG_BYTES = 64 * 1_024;
const MAX_SHELL_ENV_BYTES = 256 * 1_024;
const SHELL_ENV_TIMEOUT_MS = 4_000;
const SHELL_ENV_START = Buffer.from(
  '\0__DEV_DASHBOARD_SHELL_ENV_START__\0',
  'utf8',
);
const SHELL_ENV_END = Buffer.from(
  '\0__DEV_DASHBOARD_SHELL_ENV_END__\0',
  'utf8',
);
const SHELL_ENV_COMMAND = [
  "printf '\\000%s\\000' '__DEV_DASHBOARD_SHELL_ENV_START__'",
  'env -0',
  "printf '\\000%s\\000' '__DEV_DASHBOARD_SHELL_ENV_END__'",
].join('; ');

export interface ProjectPackageManagerEnvironmentOptions {
  processEnvironment?: NodeJS.ProcessEnv;
  resolveShellEnvironment?: (
    projectPath: string,
    environment: NodeJS.ProcessEnv,
  ) => Promise<NodeJS.ProcessEnv>;
}

export function referencedPackageManagerEnvironmentVariables(
  contents: string,
): string[] {
  const names = new Set<string>();

  for (const match of contents.matchAll(ENVIRONMENT_REFERENCE_PATTERN)) {
    const name = match[1];
    if (name) names.add(name);
  }

  return [...names].sort((left, right) => left.localeCompare(right));
}

export function parseShellEnvironmentOutput(
  output: Buffer,
): NodeJS.ProcessEnv {
  const startIndex = output.indexOf(SHELL_ENV_START);
  if (startIndex === -1) return {};

  const contentsStart = startIndex + SHELL_ENV_START.length;
  const endIndex = output.indexOf(SHELL_ENV_END, contentsStart);
  if (endIndex === -1) return {};

  const environment: NodeJS.ProcessEnv = {};
  const entries = output
    .subarray(contentsStart, endIndex)
    .toString('utf8')
    .split('\0');

  for (const entry of entries) {
    if (!entry) continue;
    const separator = entry.indexOf('=');
    if (separator <= 0) continue;

    const name = entry.slice(0, separator);
    if (!ENVIRONMENT_NAME_PATTERN.test(name)) continue;
    environment[name] = entry.slice(separator + 1);
  }

  return environment;
}

async function readProjectConfig(file: string): Promise<string | undefined> {
  try {
    const metadata = await stat(file);
    if (!metadata.isFile() || metadata.size > MAX_CONFIG_BYTES) {
      return undefined;
    }
    return await readFile(file, 'utf8');
  } catch {
    return undefined;
  }
}

async function resolveInteractiveShellEnvironment(
  projectPath: string,
  environment: NodeJS.ProcessEnv,
): Promise<NodeJS.ProcessEnv> {
  if (process.platform === 'win32') return {};

  let shell = environment.SHELL?.trim();
  if (!shell) {
    try {
      shell = userInfo().shell || undefined;
    } catch {
      return {};
    }
  }
  if (!shell || !path.isAbsolute(shell)) return {};

  return await new Promise<NodeJS.ProcessEnv>((resolve) => {
    let settled = false;
    let totalBytes = 0;
    const chunks: Buffer[] = [];
    let child: ReturnType<typeof spawn>;

    const finish = (value: NodeJS.ProcessEnv) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(value);
    };

    try {
      child = spawn(shell, ['-ilc', SHELL_ENV_COMMAND], {
        cwd: projectPath,
        env: environment,
        shell: false,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    } catch {
      resolve({});
      return;
    }

    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      finish({});
    }, SHELL_ENV_TIMEOUT_MS);
    timeout.unref();

    child.stdout?.on('data', (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += buffer.length;
      if (totalBytes > MAX_SHELL_ENV_BYTES) {
        child.kill('SIGKILL');
        finish({});
        return;
      }
      chunks.push(buffer);
    });

    child.once('error', () => finish({}));
    child.once('close', (code) => {
      if (code !== 0) {
        finish({});
        return;
      }
      finish(parseShellEnvironmentOutput(Buffer.concat(chunks, totalBytes)));
    });
  });
}

/**
 * Package managers interpolate exported variables in project-owned config
 * files such as .npmrc. The installed Dashboard runs under systemd and does
 * not inherit variables exported only by the user's interactive shell.
 *
 * Resolve only names explicitly referenced by those config files. Values are
 * forwarded in-memory to the worker and are never persisted or returned by
 * the API.
 */
export async function resolvePackageManagerEnvironment(
  projectPath: string,
  options: ProjectPackageManagerEnvironmentOptions = {},
): Promise<NodeJS.ProcessEnv> {
  const names = new Set<string>();

  for (const fileName of PACKAGE_MANAGER_CONFIG_FILES) {
    const contents = await readProjectConfig(path.join(projectPath, fileName));
    if (!contents) continue;
    for (const name of referencedPackageManagerEnvironmentVariables(contents)) {
      names.add(name);
    }
  }

  if (names.size === 0) return {};

  const processEnvironment = options.processEnvironment ?? process.env;
  const resolved: NodeJS.ProcessEnv = {};
  const missing: string[] = [];

  for (const name of [...names].sort((left, right) => left.localeCompare(right))) {
    const value = processEnvironment[name];
    if (value !== undefined) {
      resolved[name] = value;
    } else {
      missing.push(name);
    }
  }

  if (missing.length === 0) return resolved;

  const shellEnvironment = await (
    options.resolveShellEnvironment ?? resolveInteractiveShellEnvironment
  )(projectPath, processEnvironment);

  for (const name of missing) {
    const value = shellEnvironment[name];
    if (value !== undefined) resolved[name] = value;
  }

  return resolved;
}
