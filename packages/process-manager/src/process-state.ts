import { execFile } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import { promisify } from 'node:util';

import type {
  ManagedProcess,
  ManagedProcessKind,
  ManagedProcessStatus,
} from '@dev-dashboard/contracts';

export interface StoredProcess extends ManagedProcess {
  command: string;
  args: string[];
  cwd: string;
  logPath: string;
}

const managedProcessKinds = new Set<ManagedProcessKind>([
  'server',
  'webpack',
  'worker',
  'test',
  'script',
]);

const managedProcessStatuses = new Set<ManagedProcessStatus>([
  'starting',
  'running',
  'stopping',
  'stopped',
  'failed',
]);

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

function isOptionalTimestamp(value: unknown): boolean {
  return (
    value === undefined ||
    (typeof value === 'string' && Number.isFinite(Date.parse(value)))
  );
}

function isOptionalPositiveInteger(value: unknown): boolean {
  return (
    value === undefined ||
    (typeof value === 'number' && Number.isSafeInteger(value) && value > 0)
  );
}

function isOptionalPort(value: unknown): boolean {
  return (
    value === undefined ||
    (typeof value === 'number' &&
      Number.isInteger(value) &&
      value >= 1_024 &&
      value <= 65_535)
  );
}

function isOptionalExitCode(value: unknown): boolean {
  return (
    value === undefined ||
    (typeof value === 'number' && Number.isInteger(value))
  );
}

export function isStoredProcess(value: unknown): value is StoredProcess {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.id === 'string' &&
    candidate.id.length > 0 &&
    typeof candidate.projectId === 'string' &&
    candidate.projectId.length > 0 &&
    isOptionalString(candidate.workspaceId) &&
    typeof candidate.kind === 'string' &&
    managedProcessKinds.has(candidate.kind as ManagedProcessKind) &&
    typeof candidate.status === 'string' &&
    managedProcessStatuses.has(candidate.status as ManagedProcessStatus) &&
    isOptionalPositiveInteger(candidate.pid) &&
    isOptionalPort(candidate.port) &&
    isOptionalString(candidate.host) &&
    isOptionalString(candidate.url) &&
    (candidate.urls === undefined ||
      (Array.isArray(candidate.urls) &&
        candidate.urls.every(
          (url) => typeof url === 'string' && url.length > 0,
        ))) &&
    typeof candidate.command === 'string' &&
    candidate.command.length > 0 &&
    Array.isArray(candidate.args) &&
    candidate.args.every((argument) => typeof argument === 'string') &&
    typeof candidate.cwd === 'string' &&
    candidate.cwd.length > 0 &&
    typeof candidate.logPath === 'string' &&
    candidate.logPath.length > 0 &&
    isOptionalTimestamp(candidate.startedAt) &&
    isOptionalTimestamp(candidate.stoppedAt) &&
    isOptionalExitCode(candidate.exitCode)
  );
}

function canSignalProcess(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (isErrnoException(error) && error.code === 'EPERM') {
      return true;
    }

    return false;
  }
}

function isProcessAlive(pid: number): boolean {
  return canSignalProcess(pid);
}

function isProcessGroupAlive(pid: number): boolean {
  if (process.platform === 'win32') {
    return isProcessAlive(pid);
  }

  return canSignalProcess(-pid);
}

export function isManagedProcessAlive(pid: number): boolean {
  return process.platform === 'win32'
    ? isProcessAlive(pid)
    : isProcessGroupAlive(pid);
}

const execFileAsync = promisify(execFile);

export interface VerifyProcessDirectoryDeps {
  /** Só para teste — substitui `process.platform`. */
  platform?: NodeJS.Platform;
  /** Só para teste — substitui a chamada real a `lsof` (usado no ramo macOS). */
  runLsof?: (pid: number) => Promise<string>;
}

async function defaultRunLsof(pid: number): Promise<string> {
  const { stdout } = await execFileAsync('lsof', [
    '-a',
    '-p',
    String(pid),
    '-d',
    'cwd',
    '-Fn',
  ]);
  return stdout;
}

/**
 * `lsof -Fn` imprime um campo por linha, prefixado pela letra do campo — o
 * pid sempre aparece (`p<pid>`), e como `-d cwd` restringe a um único
 * descritor, no máximo uma linha `n<caminho>` (o campo "name") aparece.
 */
function parseLsofCwd(output: string): string | null {
  const line = output
    .split('\n')
    .find((entry) => entry.startsWith('n') && entry.length > 1);
  return line ? line.slice(1) : null;
}

/**
 * macOS não tem `/proc`; `lsof -a -p <pid> -d cwd -Fn` é o equivalente
 * prático para descobrir o cwd de um processo em execução. Só retorna
 * `false` (identidade não confirmada) quando há evidência concreta de
 * divergência — qualquer falha em rodar/interpretar `lsof` retorna `true`
 * (mesmo comportamento de "não verificado, não bloqueia" que este pacote já
 * tinha para plataformas fora do Linux antes desta função existir).
 */
async function verifyProcessDirectoryDarwin(
  storedProcess: StoredProcess,
  runLsof: (pid: number) => Promise<string>,
): Promise<boolean> {
  let output: string;
  try {
    output = await runLsof(storedProcess.pid!);
  } catch {
    return true;
  }

  const rawCwd = parseLsofCwd(output);
  if (!rawCwd) {
    return true;
  }

  try {
    const processDirectory = await realpath(rawCwd);
    const expectedDirectory = await realpath(storedProcess.cwd);
    return processDirectory === expectedDirectory;
  } catch {
    return false;
  }
}

export async function verifyProcessDirectory(
  storedProcess: StoredProcess,
  deps: VerifyProcessDirectoryDeps = {},
): Promise<boolean> {
  if (!storedProcess.pid) {
    return false;
  }

  const platform = deps.platform ?? process.platform;

  if (platform === 'darwin') {
    return verifyProcessDirectoryDarwin(
      storedProcess,
      deps.runLsof ?? defaultRunLsof,
    );
  }

  if (platform !== 'linux') {
    return true;
  }

  if (!isProcessAlive(storedProcess.pid)) {
    return isProcessGroupAlive(storedProcess.pid);
  }

  try {
    const processDirectory = await realpath(`/proc/${storedProcess.pid}/cwd`);

    const expectedDirectory = await realpath(storedProcess.cwd);

    return processDirectory === expectedDirectory;
  } catch {
    return false;
  }
}
