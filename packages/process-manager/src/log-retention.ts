import {
  readdir,
  readFile,
  rm,
  stat,
} from 'node:fs/promises';

import path from 'node:path';

import {
  isManagedProcessAlive,
  isStoredProcess,
  type StoredProcess,
  verifyProcessDirectory,
} from './process-state.js';

export interface SweepStaleProcessesOptions {
  maxAgeMs?: number;
}

export interface SweptProcess {
  projectId: string;
}

const DEFAULT_RETENTION_DAYS = 7;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

function isErrnoException(
  error: unknown,
): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

function resolveMaxAgeMs(
  options?: SweepStaleProcessesOptions,
): number {
  if (options?.maxAgeMs !== undefined) {
    if (
      !Number.isFinite(options.maxAgeMs) ||
      options.maxAgeMs <= 0
    ) {
      throw new Error(
        'O período de retenção deve ser maior que zero.',
      );
    }

    return options.maxAgeMs;
  }

  const raw =
    process.env.DEV_DASHBOARD_LOG_RETENTION_DAYS;

  const parsedDays =
    raw !== undefined
      ? Number.parseInt(raw, 10)
      : Number.NaN;

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
  let status = storedProcess.status;

  if (
    status === 'running' ||
    status === 'starting' ||
    status === 'stopping'
  ) {
    const alive =
      storedProcess.pid !== undefined &&
      isManagedProcessAlive(storedProcess.pid) &&
      (await verifyProcessDirectory(storedProcess));

    status = alive ? status : 'stopped';
  }

  if (status !== 'stopped' && status !== 'failed') {
    return false;
  }

  const stoppedTimestamp = storedProcess.stoppedAt
    ? new Date(storedProcess.stoppedAt).getTime()
    : Number.NaN;

  const referenceTimestamp = Number.isFinite(
    stoppedTimestamp,
  )
    ? stoppedTimestamp
    : (await stat(stateFilePath)).mtimeMs;

  return Date.now() - referenceTimestamp > maxAgeMs;
}

const MANAGED_STATE_SUFFIX_PATTERN =
  /\.(server|test)\.json$/;

function resolveManagedLogPath(
  logDirectory: string,
  stateFileName: string,
): string {
  const logFileName = stateFileName.replace(
    /\.(server|test)\.json$/,
    (_match, kind: string) => `.${kind}.log`,
  );

  return path.join(logDirectory, logFileName);
}

export async function sweepStaleProcesses(
  stateDirectory: string,
  options?: SweepStaleProcessesOptions,
): Promise<SweptProcess[]> {
  const maxAgeMs = resolveMaxAgeMs(options);

  const processDirectory = path.join(
    stateDirectory,
    'processes',
  );

  const logDirectory = path.join(
    stateDirectory,
    'logs',
  );

  const entries = await readdir(processDirectory, {
    withFileTypes: true,
  }).catch((error: unknown) => {
    if (
      isErrnoException(error) &&
      error.code === 'ENOENT'
    ) {
      return [];
    }

    throw error;
  });

  const swept: SweptProcess[] = [];

  for (const entry of entries) {
    if (
      !entry.isFile() ||
      !MANAGED_STATE_SUFFIX_PATTERN.test(entry.name)
    ) {
      continue;
    }

    const stateFilePath = path.join(
      processDirectory,
      entry.name,
    );

    try {
      const contents = await readFile(
        stateFilePath,
        'utf8',
      );

      const parsed: unknown = JSON.parse(contents);

      if (!isStoredProcess(parsed)) {
        continue;
      }

      if (
        !(await isEligibleForRemoval(
          parsed,
          stateFilePath,
          maxAgeMs,
        ))
      ) {
        continue;
      }

      const managedLogPath = resolveManagedLogPath(
        logDirectory,
        entry.name,
      );

      await rm(stateFilePath, {
        force: true,
      });

      await rm(managedLogPath, {
        force: true,
      });

      swept.push({
        projectId: parsed.projectId,
      });
    } catch {
      // Um estado corrompido não deve interromper
      // a limpeza dos demais.
    }
  }

  return swept;
}
