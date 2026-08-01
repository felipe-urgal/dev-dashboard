import type { spawn } from 'node:child_process';

import { isManagedProcessAlive } from './process-state.js';
import type { StoredProcess } from './process-state.js';
import {
  readStoredProcess,
  terminalProcess,
  writeStoredProcess,
  type ManagedKind,
  type ProcessStoreContext,
} from './process-store.js';

export interface ObservedExit {
  pid: number;
  exitCode?: number | null;
}

export async function waitForProcessExit(
  pid: number,
  timeoutMs: number,
): Promise<boolean> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (!isManagedProcessAlive(pid)) {
      return true;
    }

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 100);
    });
  }

  return !isManagedProcessAlive(pid);
}

export interface ExitTracker {
  observeChild(
    child: ReturnType<typeof spawn>,
    managedProcess: StoredProcess,
  ): void;
  waitForObservedExit(
    projectId: string,
    kind: ManagedKind,
    pid: number,
    timeoutMs?: number,
  ): Promise<ObservedExit | undefined>;
  waitForManagedExit(
    projectId: string,
    kind: ManagedKind,
    pid: number,
    timeoutMs: number,
    acceptObservedExit?: boolean,
  ): Promise<boolean>;
  clearObservedExit(projectId: string, kind: ManagedKind, pid: number): void;
}

export function createExitTracker(context: ProcessStoreContext): ExitTracker {
  const observedExits = new Map<string, ObservedExit>();
  const exitWaiters = new Map<
    string,
    {
      pid: number;
      promise: Promise<ObservedExit>;
    }
  >();

  function clearObservedExit(
    projectId: string,
    kind: ManagedKind,
    pid: number,
  ): void {
    const key = `${projectId}:${kind}`;
    if (observedExits.get(key)?.pid === pid) {
      observedExits.delete(key);
    }

    if (exitWaiters.get(key)?.pid === pid) {
      exitWaiters.delete(key);
    }
  }

  async function recordChildExit(
    projectId: string,
    kind: ManagedKind,
    pid: number,
    exitCode?: number | null,
  ): Promise<void> {
    const currentProcess = await readStoredProcess(context, projectId, kind);

    if (!currentProcess) {
      clearObservedExit(projectId, kind, pid);
      return;
    }

    if (currentProcess.pid !== pid) {
      if (
        currentProcess.pid === undefined &&
        (currentProcess.status === 'stopped' ||
          currentProcess.status === 'failed') &&
        currentProcess.exitCode === undefined &&
        exitCode !== undefined &&
        exitCode !== null
      ) {
        await writeStoredProcess(context, {
          ...currentProcess,
          exitCode,
        });
      }

      clearObservedExit(projectId, kind, pid);
      return;
    }

    const status =
      currentProcess.status === 'stopping' ||
      (currentProcess.status === 'running' && exitCode === 0)
        ? 'stopped'
        : 'failed';

    await writeStoredProcess(
      context,
      terminalProcess(currentProcess, status, exitCode),
    );

    clearObservedExit(projectId, kind, pid);
  }

  function observeChild(
    child: ReturnType<typeof spawn>,
    managedProcess: StoredProcess,
  ): void {
    let recorded = false;
    let resolveExit!: (observation: ObservedExit) => void;

    const exitPromise = new Promise<ObservedExit>((resolve) => {
      resolveExit = resolve;
    });

    const pid = managedProcess.pid as number;

    const key = `${managedProcess.projectId}:${managedProcess.kind}`;

    exitWaiters.set(key, {
      pid,
      promise: exitPromise,
    });

    const record = (exitCode?: number | null): void => {
      if (recorded) {
        return;
      }

      recorded = true;

      const observation: ObservedExit = {
        pid,
        ...(exitCode !== undefined ? { exitCode } : {}),
      };

      observedExits.set(key, observation);
      resolveExit(observation);

      void recordChildExit(
        managedProcess.projectId,
        managedProcess.kind as ManagedKind,
        pid,
        exitCode,
      ).catch(() => undefined);
    };

    child.once('exit', (code) => record(code));
    child.once('error', () => record(undefined));

    if (child.exitCode !== null || child.signalCode !== null) {
      record(child.exitCode);
    }
  }

  async function waitForObservedExit(
    projectId: string,
    kind: ManagedKind,
    pid: number,
    timeoutMs = 1_000,
  ): Promise<ObservedExit | undefined> {
    const key = `${projectId}:${kind}`;
    const existing = observedExits.get(key);

    if (existing?.pid === pid) {
      return existing;
    }

    const waiter = exitWaiters.get(key);

    if (!waiter || waiter.pid !== pid) {
      return undefined;
    }

    return await Promise.race([
      waiter.promise,
      new Promise<undefined>((resolve) => {
        setTimeout(() => resolve(undefined), timeoutMs);
      }),
    ]);
  }

  async function waitForManagedExit(
    projectId: string,
    kind: ManagedKind,
    pid: number,
    timeoutMs: number,
    acceptObservedExit = false,
  ): Promise<boolean> {
    const observedExit = waitForObservedExit(
      projectId,
      kind,
      pid,
      timeoutMs,
    ).then((observation) =>
      observation !== undefined
        ? acceptObservedExit || !isManagedProcessAlive(pid)
        : false,
    );

    const groupExit = waitForProcessExit(pid, timeoutMs);

    return await Promise.race([observedExit, groupExit]);
  }

  return {
    observeChild,
    waitForObservedExit,
    waitForManagedExit,
    clearObservedExit,
  };
}
