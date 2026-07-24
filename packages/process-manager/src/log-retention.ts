import { readdir, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';

import { isStoredProcess, type StoredProcess } from './process-manager.js';

export interface SweepStaleProcessesOptions {
  maxAgeMs?: number;
}

export interface SweptProcess {
  projectId: string;
  logPath: string;
  stateFilePath: string;
}

const DEFAULT_RETENTION_DAYS = 7;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

function isErrnoException(
  error: unknown,
): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

function resolveMaxAgeMs(options?: SweepStaleProcessesOptions): number {
  if (options?.maxAgeMs !== undefined) {
    return options.maxAgeMs;
  }

  const raw = process.env.DEV_DASHBOARD_LOG_RETENTION_DAYS;
  const parsedDays = raw !== undefined ? Number.parseInt(raw, 10) : NaN;

  const days =
    Number.isInteger(parsedDays) && parsedDays > 0
      ? parsedDays
      : DEFAULT_RETENTION_DAYS;

  return days * DAY_IN_MS;
}

async function isEligibleForRemoval(
  storedProcess: StoredProcess,
  stateFilePath: string,
  maxAgeMs: number,
): Promise<boolean> {
  if (
    storedProcess.status !== 'stopped' &&
    storedProcess.status !== 'failed'
  ) {
    return false;
  }

  const referenceTimestamp = storedProcess.stoppedAt
    ? new Date(storedProcess.stoppedAt).getTime()
    : (await stat(stateFilePath)).mtimeMs;

  return Date.now() - referenceTimestamp > maxAgeMs;
}

export async function sweepStaleProcesses(
  stateDirectory: string,
  options?: SweepStaleProcessesOptions,
): Promise<SweptProcess[]> {
  const maxAgeMs = resolveMaxAgeMs(options);
  const processDirectory = path.join(stateDirectory, 'processes');

  const entries = await readdir(processDirectory, {
    withFileTypes: true,
  }).catch((error: unknown) => {
    if (isErrnoException(error) && error.code === 'ENOENT') {
      return [];
    }

    throw error;
  });

  const swept: SweptProcess[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.server.json')) {
      continue;
    }

    const stateFilePath = path.join(processDirectory, entry.name);
    const contents = await readFile(stateFilePath, 'utf8');
    const parsed: unknown = JSON.parse(contents);

    if (!isStoredProcess(parsed)) {
      continue;
    }

    if (!(await isEligibleForRemoval(parsed, stateFilePath, maxAgeMs))) {
      continue;
    }

    await rm(stateFilePath, { force: true });
    await rm(parsed.logPath, { force: true });

    swept.push({
      projectId: parsed.projectId,
      logPath: parsed.logPath,
      stateFilePath,
    });
  }

  return swept;
}
