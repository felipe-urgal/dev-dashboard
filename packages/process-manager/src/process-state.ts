import {
  realpath,
} from 'node:fs/promises';

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
  'compose-build',
]);

const managedProcessStatuses = new Set<ManagedProcessStatus>([
  'starting',
  'running',
  'stopping',
  'stopped',
  'failed',
]);

function isErrnoException(
  error: unknown,
): error is NodeJS.ErrnoException {
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
    (typeof value === 'number' &&
      Number.isSafeInteger(value) &&
      value > 0)
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

export function isStoredProcess(
  value: unknown,
): value is StoredProcess {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value)
  ) {
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
    managedProcessKinds.has(
      candidate.kind as ManagedProcessKind,
    ) &&
    typeof candidate.status === 'string' &&
    managedProcessStatuses.has(
      candidate.status as ManagedProcessStatus,
    ) &&
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
    candidate.args.every(
      (argument) => typeof argument === 'string',
    ) &&
    typeof candidate.cwd === 'string' &&
    candidate.cwd.length > 0 &&
    typeof candidate.logPath === 'string' &&
    candidate.logPath.length > 0 &&
    isOptionalTimestamp(candidate.startedAt) &&
    isOptionalTimestamp(candidate.stoppedAt) &&
    isOptionalExitCode(candidate.exitCode) &&
    (candidate.kind !== 'compose-build' ||
      (typeof candidate.composeServiceName === 'string' &&
        candidate.composeServiceName.length > 0))
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

export async function verifyProcessDirectory(
  storedProcess: StoredProcess,
): Promise<boolean> {
  if (!storedProcess.pid) {
    return false;
  }

  if (process.platform !== 'linux') {
    return true;
  }

  if (!isProcessAlive(storedProcess.pid)) {
    return isProcessGroupAlive(storedProcess.pid);
  }

  try {
    const processDirectory = await realpath(
      `/proc/${storedProcess.pid}/cwd`,
    );

    const expectedDirectory = await realpath(
      storedProcess.cwd,
    );

    return processDirectory === expectedDirectory;
  } catch {
    return false;
  }
}
