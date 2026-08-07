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

/**
 * `exitCode` aceita `null` aqui (e em `recordChildExit`/`record` abaixo)
 * porque é o valor bruto de `child.exitCode` do Node, que é `null` quando o
 * processo foi encerrado por sinal em vez de terminar sozinho. Esse `null`
 * nunca chega ao contrato público: `terminalProcess`
 * (`process-store.ts`) omite o campo `exitCode` inteiramente quando ele é
 * `null` ou `undefined`, então `ManagedProcess.exitCode` em
 * `@dev-dashboard/contracts` continua podendo ser só `number | undefined`.
 */
export interface ObservedExit {
  pid: number;
  exitCode?: number | null;
}

/**
 * `observeChild`/`recordChildExit` só limpam a entrada de um projeto+kind
 * quando o evento `exit`/`error` do processo filho realmente dispara. Se
 * isso nunca acontecer (caso raro, mas possível — ex. um handle que nunca
 * emite os eventos), a entrada ficaria presa nos mapas indefinidamente.
 * Este teto é bem maior que qualquer timeout real de start/stop usado no
 * dashboard — serve só de expurgo defensivo, não de comportamento normal.
 */
const STALE_ENTRY_TTL_MS = 10 * 60 * 1_000;

interface ExitWaiterEntry {
  pid: number;
  promise: Promise<ObservedExit>;
  createdAt: number;
}

interface ObservedExitEntry {
  observation: ObservedExit;
  createdAt: number;
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

export function createExitTracker(
  context: ProcessStoreContext,
  now: () => number = Date.now,
): ExitTracker {
  const observedExits = new Map<string, ObservedExitEntry>();
  const exitWaiters = new Map<string, ExitWaiterEntry>();

  function sweepStaleEntries(): void {
    const cutoff = now() - STALE_ENTRY_TTL_MS;

    for (const [key, entry] of observedExits) {
      if (entry.createdAt < cutoff) observedExits.delete(key);
    }
    for (const [key, entry] of exitWaiters) {
      if (entry.createdAt < cutoff) exitWaiters.delete(key);
    }
  }

  function clearObservedExit(
    projectId: string,
    kind: ManagedKind,
    pid: number,
  ): void {
    const key = `${projectId}:${kind}`;
    if (observedExits.get(key)?.observation.pid === pid) {
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
    sweepStaleEntries();

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
      createdAt: now(),
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

      observedExits.set(key, { observation, createdAt: now() });
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

    if (existing?.observation.pid === pid) {
      return existing.observation;
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
    const groupExit = waitForProcessExit(pid, timeoutMs);
    const observation = await waitForObservedExit(
      projectId,
      kind,
      pid,
      timeoutMs,
    );

    if (
      observation !== undefined &&
      (acceptObservedExit || !isManagedProcessAlive(pid))
    ) {
      return true;
    }

    return await groupExit;
  }

  return {
    observeChild,
    waitForObservedExit,
    waitForManagedExit,
    clearObservedExit,
  };
}
