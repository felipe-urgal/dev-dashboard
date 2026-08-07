import { createHash, randomBytes } from 'node:crypto';

import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';

import path from 'node:path';

import type { ManagedProcessStatus } from '@dev-dashboard/contracts';

import { isErrnoException } from './errors.js';
import { isStoredProcess, type StoredProcess } from './process-state.js';
import { quarantineUnreadableStateFile } from './state-file-recovery.js';

/**
 * Subconjunto de `ManagedProcessKind` (`@dev-dashboard/contracts`) que este
 * `ProcessStore` de fato gerencia. `'script'` fica de fora de propósito:
 * scripts têm seu próprio ciclo de vida e persistência independentes em
 * `apps/api/src/services/script-execution/`, que não passa por
 * `readStoredProcess`/`writeStoredProcess`/`listStoredProcessEntries` — não
 * é uma lacuna a preencher, é um gerenciador diferente para um tipo de
 * processo diferente. Única fonte de verdade também para o regex de nome de
 * arquivo em `listStoredProcessEntries`, para os dois nunca divergirem.
 */
export const MANAGED_KINDS = ['server', 'test', 'worker', 'webpack'] as const;

export type ManagedKind = (typeof MANAGED_KINDS)[number];

const MANAGED_KIND_FILE_PATTERN = new RegExp(
  `\\.(${MANAGED_KINDS.join('|')})\\.json$`,
);

export interface ProcessStoreContext {
  readonly processDirectory: string;
  readonly logDirectory: string;
}

export function createProjectKey(projectId: string): string {
  const readable = projectId.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 80);

  const hash = createHash('sha256').update(projectId).digest('hex').slice(0, 8);

  return `${readable}-${hash}`;
}

export function resolveLogFile(
  context: ProcessStoreContext,
  projectId: string,
  kind: ManagedKind,
): string {
  return path.join(
    context.logDirectory,
    `${createProjectKey(projectId)}.${kind}.log`,
  );
}

export function resolveProcessFile(
  context: ProcessStoreContext,
  projectId: string,
  kind: ManagedKind,
): string {
  return path.join(
    context.processDirectory,
    `${createProjectKey(projectId)}.${kind}.json`,
  );
}

export async function readStoredProcess(
  context: ProcessStoreContext,
  projectId: string,
  kind: ManagedKind,
): Promise<StoredProcess | null> {
  const processFile = resolveProcessFile(context, projectId, kind);

  let contents: string;
  try {
    contents = await readFile(processFile, 'utf8');
  } catch (error) {
    if (isErrnoException(error) && error.code === 'ENOENT') {
      return null;
    }

    throw error;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    quarantineUnreadableStateFile(processFile);
    return null;
  }

  if (!isStoredProcess(parsed)) {
    quarantineUnreadableStateFile(processFile);
    return null;
  }

  return parsed;
}

export async function writeStoredProcess(
  context: ProcessStoreContext,
  managedProcess: StoredProcess,
): Promise<void> {
  await mkdir(context.processDirectory, {
    recursive: true,
    mode: 0o700,
  });

  const processFile = resolveProcessFile(
    context,
    managedProcess.projectId,
    managedProcess.kind as ManagedKind,
  );

  const temporaryFile = `${processFile}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;

  await writeFile(
    temporaryFile,
    `${JSON.stringify(managedProcess, null, 2)}\n`,
    {
      encoding: 'utf8',
      mode: 0o600,
    },
  );

  await rename(temporaryFile, processFile);
}

export async function listStoredProcessEntries(
  context: ProcessStoreContext,
): Promise<StoredProcess[]> {
  const entries = await readdir(context.processDirectory, {
    withFileTypes: true,
  }).catch((error: unknown) => {
    if (isErrnoException(error) && error.code === 'ENOENT') {
      return [];
    }

    throw error;
  });

  const processes: StoredProcess[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !MANAGED_KIND_FILE_PATTERN.test(entry.name)) {
      continue;
    }

    const entryFile = path.join(context.processDirectory, entry.name);

    let contents: string;
    try {
      contents = await readFile(entryFile, 'utf8');
    } catch (error) {
      if (isErrnoException(error) && error.code === 'ENOENT') {
        continue;
      }

      throw error;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(contents);
    } catch {
      quarantineUnreadableStateFile(entryFile);
      continue;
    }

    if (!isStoredProcess(parsed)) {
      quarantineUnreadableStateFile(entryFile);
      continue;
    }

    processes.push(parsed);
  }

  return processes;
}

/**
 * Fronteira onde `exitCode` deixa de aceitar `null`: o chamador pode passar
 * o valor bruto de `child.exitCode` do Node (`number | null`, `null` quando
 * o processo morreu por sinal), mas o `StoredProcess` resultante — e o
 * `ManagedProcess` público de `@dev-dashboard/contracts` — só declaram
 * `exitCode?: number`. Um `exitCode` `null` ou `undefined` aqui simplesmente
 * não entra no objeto retornado, em vez de virar `exitCode: null`.
 */
export function terminalProcess(
  storedProcess: StoredProcess,
  status: Extract<ManagedProcessStatus, 'stopped' | 'failed'>,
  exitCode?: number | null,
): StoredProcess {
  const {
    pid: _pid,
    exitCode: _previousExitCode,
    stoppedAt: _previousStoppedAt,
    ...rest
  } = storedProcess;

  return {
    ...rest,
    status,
    stoppedAt: new Date().toISOString(),
    ...(exitCode !== undefined && exitCode !== null ? { exitCode } : {}),
  };
}
