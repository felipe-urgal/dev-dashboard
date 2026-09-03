import { spawn } from 'node:child_process';
import { mkdir, open } from 'node:fs/promises';

import type { ManagedProcess, Project } from '@dev-dashboard/contracts';

import { ProcessManagerError } from './errors.js';
import { sweepStaleProcesses } from './log-retention.js';
import type { ExitTracker } from './process-exit-tracking.js';
import type { ProcessStatusReader } from './process-status.js';
import type { StoredProcess } from './process-state.js';
import {
  resolveLogFile,
  writeStoredProcess,
  type ManagedKind,
  type ProcessStoreContext,
} from './process-store.js';

export interface ManagedProcessStartDependencies {
  context: ProcessStoreContext;
  exitTracker: ExitTracker;
  statusReader: ProcessStatusReader;
  stateDirectory: string;
  sendSignal: (pid: number, signal: NodeJS.Signals) => void;
}

export interface ManagedProcessStartSpec {
  project: Project;
  kind: ManagedKind;
  id: string;
  status: Extract<StoredProcess['status'], 'starting' | 'running'>;
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  missingPidMessage: string;
  metadata?: Pick<StoredProcess, 'port' | 'url' | 'urls'>;
}

function isActiveStatus(status: ManagedProcess['status'] | undefined): boolean {
  return status === 'running' || status === 'starting' || status === 'stopping';
}

async function sweepStateBestEffort(stateDirectory: string): Promise<void> {
  try {
    await sweepStaleProcesses(stateDirectory);
  } catch {
    // Limpeza defensiva nunca deve impedir o início de um processo válido.
  }
}

export async function prepareManagedProcessStart(
  dependencies: ManagedProcessStartDependencies,
  project: Project,
  kind: ManagedKind,
  alreadyRunningMessage: string,
): Promise<void> {
  await sweepStateBestEffort(dependencies.stateDirectory);

  const currentProcess = await dependencies.statusReader.getManagedProcess(
    project.id,
    kind,
  );

  if (isActiveStatus(currentProcess?.status)) {
    throw new ProcessManagerError(
      'PROCESS_ALREADY_RUNNING',
      alreadyRunningMessage,
    );
  }
}

async function ensureStateDirectories(
  context: ProcessStoreContext,
): Promise<void> {
  await Promise.all([
    mkdir(context.processDirectory, { recursive: true, mode: 0o700 }),
    mkdir(context.logDirectory, { recursive: true, mode: 0o700 }),
  ]);
}

async function spawnManagedChild(
  context: ProcessStoreContext,
  spec: ManagedProcessStartSpec,
): Promise<{ child: ReturnType<typeof spawn>; logPath: string }> {
  const logPath = resolveLogFile(context, spec.project.id, spec.kind);
  const logHandle = await open(logPath, 'a', 0o600);

  let child: ReturnType<typeof spawn>;

  try {
    child = spawn(spec.command, spec.args, {
      cwd: spec.project.path,
      detached: true,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', logHandle.fd, logHandle.fd],
      env: spec.env,
    });

    await new Promise<void>((resolve, reject) => {
      child.once('spawn', resolve);
      child.once('error', reject);
    });
  } finally {
    await logHandle.close();
  }

  return { child, logPath };
}

function toStoredProcess(
  spec: ManagedProcessStartSpec,
  pid: number,
  logPath: string,
): StoredProcess {
  return {
    id: spec.id,
    projectId: spec.project.id,
    ...(spec.project.workspaceId
      ? { workspaceId: spec.project.workspaceId }
      : {}),
    kind: spec.kind,
    status: spec.status,
    pid,
    command: spec.command,
    args: spec.args,
    cwd: spec.project.path,
    logPath,
    startedAt: new Date().toISOString(),
    ...(spec.metadata ?? {}),
  };
}

export async function startManagedProcess(
  dependencies: ManagedProcessStartDependencies,
  spec: ManagedProcessStartSpec,
): Promise<ManagedProcess> {
  await ensureStateDirectories(dependencies.context);
  const { child, logPath } = await spawnManagedChild(
    dependencies.context,
    spec,
  );

  if (!child.pid) {
    throw new Error(spec.missingPidMessage);
  }

  const managedProcess = toStoredProcess(spec, child.pid, logPath);

  try {
    await writeStoredProcess(dependencies.context, managedProcess);
  } catch (error) {
    try {
      dependencies.sendSignal(child.pid, 'SIGKILL');
    } catch {
      // A falha de persistência original deve ser preservada.
    }
    throw error;
  }

  dependencies.exitTracker.observeChild(child, managedProcess);
  child.unref();

  return managedProcess;
}
