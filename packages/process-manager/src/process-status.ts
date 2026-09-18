import type { ManagedProcess } from '@dev-dashboard/contracts';

import type { ExitTracker } from './process-exit-tracking.js';
import { detectListeningPortsForProcessTree } from './listening-port-discovery.js';
import { canConnect } from './port-utils.js';
import {
  isManagedProcessAlive,
  verifyProcessDirectory,
} from './process-state.js';
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
    environmentInstanceId?: string,
  ): Promise<ManagedProcess | null>;
  listProcesses(): Promise<ManagedProcess[]>;
}

export function createProcessStatusReader(
  context: ProcessStoreContext,
  exitTracker: ExitTracker,
): ProcessStatusReader {
  async function detectOwnedReadyServerPort(
    pid: number,
    expectedPort: number | undefined,
  ): Promise<number | undefined> {
    const detectedPorts = await detectListeningPortsForProcessTree(pid);
    const candidates =
      expectedPort !== undefined && detectedPorts.includes(expectedPort)
        ? [
            expectedPort,
            ...detectedPorts.filter((port) => port !== expectedPort),
          ]
        : detectedPorts;

    for (const port of candidates) {
      if (await canConnect('127.0.0.1', port)) {
        return port;
      }
    }

    return undefined;
  }

  async function detectReadyServerPort(
    storedProcess: StoredProcess,
  ): Promise<number | undefined> {
    const expectedPort = storedProcess.port;

    if (storedProcess.pid !== undefined && process.platform === 'linux') {
      return detectOwnedReadyServerPort(storedProcess.pid, expectedPort);
    }

    if (
      expectedPort !== undefined &&
      (await canConnect('127.0.0.1', expectedPort))
    ) {
      return expectedPort;
    }

    return undefined;
  }

  async function getManagedProcess(
    projectId: string,
    kind: ManagedKind,
    environmentInstanceId?: string,
  ): Promise<ManagedProcess | null> {
    const storedProcess = await readStoredProcess(
      context,
      projectId,
      kind,
      environmentInstanceId,
    );

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
                1_000,
                storedProcess.environmentInstanceId,
              )
            : undefined;

        const refreshedProcess = await readStoredProcess(
          context,
          projectId,
          kind,
          environmentInstanceId,
        );

        if (
          !refreshedProcess ||
          refreshedProcess.pid !== storedProcess.pid ||
          refreshedProcess.startedAt !== storedProcess.startedAt ||
          refreshedProcess.status === 'stopped' ||
          refreshedProcess.status === 'failed'
        ) {
          return refreshedProcess;
        }

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
          exitTracker.clearObservedExit(
            projectId,
            kind,
            storedProcess.pid,
            storedProcess.environmentInstanceId,
          );
        }

        return finishedProcess;
      }

      if (kind === 'server' && storedProcess.status === 'starting') {
        const readyPort = await detectReadyServerPort(storedProcess);

        if (readyPort !== undefined) {
          const portChanged = readyPort !== storedProcess.port;
          const primaryUrl = `http://localhost:${readyPort}`;
          const runningProcess: StoredProcess = {
            ...storedProcess,
            status: 'running',
            ...(portChanged
              ? {
                  port: readyPort,
                  url: primaryUrl,
                  urls: [primaryUrl],
                }
              : {}),
          };

          await writeStoredProcess(context, runningProcess);

          return runningProcess;
        }
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
    const identities = new Map<
      string,
      {
        projectId: string;
        kind: ManagedKind;
        environmentInstanceId: string;
      }
    >();

    for (const entry of entries) {
      const environmentInstanceId =
        entry.environmentInstanceId ?? `environment:primary:${entry.projectId}`;
      const kind = entry.kind as ManagedKind;
      identities.set(`${entry.projectId}:${environmentInstanceId}:${kind}`, {
        projectId: entry.projectId,
        kind,
        environmentInstanceId,
      });
    }

    const processes: ManagedProcess[] = [];
    for (const identity of identities.values()) {
      const managedProcess = await getManagedProcess(
        identity.projectId,
        identity.kind,
        identity.environmentInstanceId,
      );
      if (managedProcess) processes.push(managedProcess);
    }

    return processes.sort(
      (left, right) =>
        left.projectId.localeCompare(right.projectId) ||
        (left.environmentInstanceId ?? '').localeCompare(
          right.environmentInstanceId ?? '',
        ) ||
        left.kind.localeCompare(right.kind),
    );
  }

  return { getManagedProcess, listProcesses };
}
