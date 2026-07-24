import {
  realpath,
} from 'node:fs/promises';

import type {
  ManagedProcess,
} from '@dev-dashboard/contracts';

export interface StoredProcess extends ManagedProcess {
  command: string;
  args: string[];
  cwd: string;
  logPath: string;
}

function isErrnoException(
  error: unknown,
): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
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
    typeof candidate.projectId === 'string' &&
    (candidate.workspaceId === undefined ||
      typeof candidate.workspaceId === 'string') &&
    typeof candidate.kind === 'string' &&
    typeof candidate.status === 'string' &&
    (candidate.pid === undefined ||
      typeof candidate.pid === 'number') &&
    (candidate.port === undefined ||
      typeof candidate.port === 'number') &&
    (candidate.host === undefined ||
      typeof candidate.host === 'string') &&
    (candidate.url === undefined ||
      typeof candidate.url === 'string') &&
    (candidate.urls === undefined ||
      (Array.isArray(candidate.urls) &&
        candidate.urls.every(
          (url) => typeof url === 'string',
        ))) &&
    typeof candidate.command === 'string' &&
    Array.isArray(candidate.args) &&
    candidate.args.every(
      (argument) => typeof argument === 'string',
    ) &&
    typeof candidate.cwd === 'string' &&
    typeof candidate.logPath === 'string'
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
