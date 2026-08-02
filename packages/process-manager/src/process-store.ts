import { createHash, randomBytes } from 'node:crypto';

import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';

import path from 'node:path';

import type { ManagedProcessStatus } from '@dev-dashboard/contracts';

import { isErrnoException } from './errors.js';
import { isStoredProcess, type StoredProcess } from './process-state.js';

export type ManagedKind = 'server' | 'test' | 'compose-build';

export interface ProcessStoreContext {
  readonly processDirectory: string;
  readonly logDirectory: string;
}

export function createProjectKey(projectId: string): string {
  const readable = projectId
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .slice(0, 80);

  const hash = createHash('sha256')
    .update(projectId)
    .digest('hex')
    .slice(0, 8);

  return `${readable}-${hash}`;
}

// Um `kind` pode ter várias instâncias simultâneas por projeto (ex.
// `compose-build` por serviço Compose) — o slug da instância vira um
// segmento extra no nome do arquivo, mantendo `server`/`test` (sem
// instância) compatíveis com os arquivos já existentes em disco.
export function slugifyProcessInstance(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .slice(0, 80);
}

function instanceSuffix(instance?: string): string {
  return instance ? `.${slugifyProcessInstance(instance)}` : '';
}

export function resolveLogFile(
  context: ProcessStoreContext,
  projectId: string,
  kind: ManagedKind,
  instance?: string,
): string {
  return path.join(
    context.logDirectory,
    `${createProjectKey(projectId)}.${kind}${instanceSuffix(instance)}.log`,
  );
}

export function resolveProcessFile(
  context: ProcessStoreContext,
  projectId: string,
  kind: ManagedKind,
  instance?: string,
): string {
  return path.join(
    context.processDirectory,
    `${createProjectKey(projectId)}.${kind}${instanceSuffix(instance)}.json`,
  );
}

export async function readStoredProcess(
  context: ProcessStoreContext,
  projectId: string,
  kind: ManagedKind,
  instance?: string,
): Promise<StoredProcess | null> {
  try {
    const contents = await readFile(
      resolveProcessFile(context, projectId, kind, instance),
      'utf8',
    );

    const parsed: unknown = JSON.parse(contents);

    if (!isStoredProcess(parsed)) {
      throw new Error(
        'O arquivo de estado do processo possui formato inválido.',
      );
    }

    return parsed;
  } catch (error) {
    if (isErrnoException(error) && error.code === 'ENOENT') {
      return null;
    }

    throw error;
  }
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
    managedProcess.composeServiceName,
  );

  const temporaryFile =
    `${processFile}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;

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
    if (
      !entry.isFile() ||
      !/\.(server|test|compose-build)(?:\.[a-z0-9_-]+)?\.json$/.test(entry.name)
    ) {
      continue;
    }

    const contents = await readFile(
      path.join(context.processDirectory, entry.name),
      'utf8',
    );

    const parsed: unknown = JSON.parse(contents);

    if (!isStoredProcess(parsed)) {
      throw new Error(
        `O arquivo de estado ${entry.name} possui formato inválido.`,
      );
    }

    processes.push(parsed);
  }

  return processes;
}

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
    ...(exitCode !== undefined && exitCode !== null
      ? { exitCode }
      : {}),
  };
}
