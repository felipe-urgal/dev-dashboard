import type { ManagedProcess } from '@dev-dashboard/contracts';

import type { ExitTracker } from './process-exit-tracking.js';
import { canConnect } from './port-utils.js';
import { isManagedProcessAlive, verifyProcessDirectory } from './process-state.js';
import {
  listStoredProcessEntries,
  readStoredProcess,
  terminalProcess,
  writeStoredProcess,
  type ManagedKind,
  type ProcessStoreContext,
} from './process-store.js';
import type { StoredProcess } from './process-state.js';

export interface ProcessStatusReader {
  getManagedProcess(
    projectId: string,
    kind: ManagedKind,
  ): Promise<ManagedProcess | null>;
  listProcesses(): Promise<ManagedProcess[]>;
}

export function createProcessStatusReader(
  context: ProcessStoreContext,
  exitTracker: ExitTracker,
): ProcessStatusReader {
  async function getManagedProcess(
    projectId: string,
    kind: ManagedKind,
  ): Promise<ManagedProcess | null> {
    const storedProcess = await readStoredProcess(context, projectId, kind);

    if (!storedProcess) {
      return null;
    }

    if (
      storedProcess.status === 'running' ||
      storedProcess.status === 'starting' ||
      storedProcess.status === 'stopping'
    ) {
      const running =
        storedProcess.pid !== undefined &&
        isManagedProcessAlive(storedProcess.pid) &&
        (await verifyProcessDirectory(storedProcess));

      if (!running) {
        const observedExit =
          storedProcess.pid !== undefined
            ? await exitTracker.waitForObservedExit(
                projectId,
                kind,
                storedProcess.pid,
              )
            : undefined;
        const exitCode = observedExit?.exitCode;

        const finalStatus: 'stopped' | 'failed' =
          storedProcess.status === 'stopping'
            ? 'stopped'
            : kind === 'test' && exitCode === 0
              ? 'stopped'
              : 'failed';

        const finishedProcess = terminalProcess(
          storedProcess,
          finalStatus,
          exitCode,
        );

        await writeStoredProcess(context, finishedProcess);

        if (storedProcess.pid !== undefined) {
          exitTracker.clearObservedExit(projectId, kind, storedProcess.pid);
        }

        return finishedProcess;
      }

      if (
        kind === 'server' &&
        storedProcess.status === 'starting' &&
        storedProcess.port !== undefined &&
        (await canConnect('127.0.0.1', storedProcess.port))
      ) {
        const runningProcess: StoredProcess = {
          ...storedProcess,
          status: 'running',
        };

        await writeStoredProcess(context, runningProcess);

        return runningProcess;
      }
    }

    if (
      (storedProcess.status === 'stopped' ||
        storedProcess.status === 'failed') &&
      storedProcess.pid !== undefined
    ) {
      const normalizedProcess = terminalProcess(
        storedProcess,
        storedProcess.status,
        storedProcess.exitCode,
      );

      await writeStoredProcess(context, normalizedProcess);
      return normalizedProcess;
    }

    return storedProcess;
  }

  async function listProcesses(): Promise<ManagedProcess[]> {
    const entries = await listStoredProcessEntries(context);

    const processes: ManagedProcess[] = [];

    for (const entry of entries) {
      const managedProcess = await getManagedProcess(
        entry.projectId,
        entry.kind as ManagedKind,
      );

      if (managedProcess) {
        processes.push(managedProcess);
      }
    }

    return processes.sort((left, right) =>
      left.projectId.localeCompare(right.projectId),
    );
  }

  return { getManagedProcess, listProcesses };
}
