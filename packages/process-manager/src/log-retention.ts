import {
  access,
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
  removeAllTerminal?: boolean;
}

export interface SweptProcess {
  projectId: string;
}

export interface SweptOrphanLog {
  logFile: string;
}

export type SweptEntry = SweptProcess | SweptOrphanLog;

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
  removeAllTerminal: boolean,
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

  if (removeAllTerminal) {
    return true;
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
  /\.(server|test|compose-build)(\.[a-z0-9_-]+)?\.json$/;

function resolveManagedLogPath(
  logDirectory: string,
  stateFileName: string,
): string {
  const logFileName = stateFileName.replace(
    /\.(server|test|compose-build)(\.[a-z0-9_-]+)?\.json$/,
    (_match, kind: string, instance: string | undefined) =>
      `.${kind}${instance ?? ''}.log`,
  );

  return path.join(logDirectory, logFileName);
}

export async function sweepStaleProcesses(
  stateDirectory: string,
  options?: SweepStaleProcessesOptions,
): Promise<SweptEntry[]> {
  const maxAgeMs = resolveMaxAgeMs(options);
  const removeAllTerminal =
    options?.removeAllTerminal === true;

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
          removeAllTerminal,
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

  const sweptOrphanLogs = await sweepOrphanLogs(
    processDirectory,
    logDirectory,
    maxAgeMs,
    removeAllTerminal,
  );

  return [...swept, ...sweptOrphanLogs];
}

const MANAGED_LOG_SUFFIX_PATTERN = /\.(server|test|compose-build)(\.[a-z0-9_-]+)?\.log$/;

function resolveManagedStateFileName(
  logFileName: string,
): string {
  return logFileName.replace(
    MANAGED_LOG_SUFFIX_PATTERN,
    (_match, kind: string, instance: string | undefined) =>
      `.${kind}${instance ?? ''}.json`,
  );
}

async function sweepOrphanLogs(
  processDirectory: string,
  logDirectory: string,
  maxAgeMs: number,
  removeAllTerminal: boolean,
): Promise<SweptOrphanLog[]> {
  const logEntries = await readdir(logDirectory, {
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

  const swept: SweptOrphanLog[] = [];

  for (const entry of logEntries) {
    if (
      !entry.isFile() ||
      !MANAGED_LOG_SUFFIX_PATTERN.test(entry.name)
    ) {
      continue;
    }

    const logFilePath = path.join(
      logDirectory,
      entry.name,
    );

    const stateFilePath = path.join(
      processDirectory,
      resolveManagedStateFileName(entry.name),
    );

    try {
      await access(stateFilePath);
      // Ainda existe um estado correspondente: o log não é órfão.
      continue;
    } catch {
      // Sem estado correspondente: candidato a órfão.
    }

    if (!removeAllTerminal) {
      const logStats = await stat(logFilePath);

      if (Date.now() - logStats.mtimeMs <= maxAgeMs) {
        continue;
      }
    }

    await rm(logFilePath, {
      force: true,
    });

    swept.push({
      logFile: entry.name,
    });
  }

  return swept;
}
