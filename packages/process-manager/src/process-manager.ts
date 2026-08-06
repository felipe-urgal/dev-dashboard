import path from 'node:path';

import type {
  ManagedProcess,
  ProcessLogSnapshot,
  Project,
} from '@dev-dashboard/contracts';

import { createExitTracker } from './process-exit-tracking.js';
import {
  clearManagedLog,
  readManagedLog,
  type ReadServerLogOptions,
} from './process-logs.js';
import {
  createProcessLifecycle,
  type StartServerOptions,
  type StartWorkerCommand,
} from './process-lifecycle.js';
import { createProcessStatusReader } from './process-status.js';
import type { ManagedKind, ProcessStoreContext } from './process-store.js';
import { resolveStateDirectory } from './state-directory.js';

export { ProcessManagerError } from './errors.js';
export type { ProcessManagerErrorCode } from './errors.js';
export type { ReadServerLogOptions } from './process-logs.js';
export type {
  StartServerOptions,
  StartWorkerCommand,
} from './process-lifecycle.js';

export type WorkerKind = Extract<ManagedKind, 'worker' | 'webpack'>;

export class ProcessManager {
  public readonly stateDirectory: string;
  private readonly context: ProcessStoreContext;
  private readonly exitTracker: ReturnType<typeof createExitTracker>;
  private readonly statusReader: ReturnType<typeof createProcessStatusReader>;
  private readonly lifecycle: ReturnType<typeof createProcessLifecycle>;
  private readonly startLocks = new Map<string, Promise<unknown>>();

  public constructor(stateDirectory = resolveStateDirectory()) {
    this.stateDirectory = stateDirectory;

    this.context = {
      processDirectory: path.join(stateDirectory, 'processes'),
      logDirectory: path.join(stateDirectory, 'logs'),
    };

    this.exitTracker = createExitTracker(this.context);
    this.statusReader = createProcessStatusReader(
      this.context,
      this.exitTracker,
    );
    this.lifecycle = createProcessLifecycle(
      this.context,
      this.exitTracker,
      this.statusReader,
    );
  }

  private async withStartLock<T>(
    projectId: string,
    kind: ManagedKind,
    action: () => Promise<T>,
  ): Promise<T> {
    const key = `${projectId}:${kind}`;
    const previous = this.startLocks.get(key) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(action);
    const tail = current.then(
      () => undefined,
      () => undefined,
    );
    this.startLocks.set(key, tail);
    try {
      return await current;
    } finally {
      if (this.startLocks.get(key) === tail) {
        this.startLocks.delete(key);
      }
    }
  }

  public getServerProcess(projectId: string): Promise<ManagedProcess | null> {
    return this.statusReader.getManagedProcess(projectId, 'server');
  }

  public getTestProcess(projectId: string): Promise<ManagedProcess | null> {
    return this.statusReader.getManagedProcess(projectId, 'test');
  }

  public getWorkerProcess(
    projectId: string,
    kind: WorkerKind,
  ): Promise<ManagedProcess | null> {
    return this.statusReader.getManagedProcess(projectId, kind);
  }

  public listProcesses(): Promise<ManagedProcess[]> {
    return this.statusReader.listProcesses();
  }

  public readServerLog(
    projectId: string,
    options: ReadServerLogOptions = {},
  ): Promise<ProcessLogSnapshot> {
    return readManagedLog(this.context, projectId, 'server', options);
  }

  public readTestLog(
    projectId: string,
    options: ReadServerLogOptions = {},
  ): Promise<ProcessLogSnapshot> {
    return readManagedLog(this.context, projectId, 'test', options);
  }

  public clearServerLog(projectId: string): Promise<ProcessLogSnapshot> {
    return clearManagedLog(this.context, projectId, 'server');
  }

  public clearTestLog(projectId: string): Promise<ProcessLogSnapshot> {
    return clearManagedLog(this.context, projectId, 'test');
  }

  public readWorkerLog(
    projectId: string,
    kind: WorkerKind,
    options: ReadServerLogOptions = {},
  ): Promise<ProcessLogSnapshot> {
    return readManagedLog(this.context, projectId, kind, options);
  }

  public clearWorkerLog(
    projectId: string,
    kind: WorkerKind,
  ): Promise<ProcessLogSnapshot> {
    return clearManagedLog(this.context, projectId, kind);
  }

  public startServer(
    project: Project,
    options: StartServerOptions = {},
  ): Promise<ManagedProcess> {
    return this.withStartLock(project.id, 'server', () =>
      this.lifecycle.startManagedServer(project, options, this.stateDirectory),
    );
  }

  public startTest(
    project: Project,
    command: { id: string; command: string; args: string[] },
  ): Promise<ManagedProcess> {
    return this.withStartLock(project.id, 'test', () =>
      this.lifecycle.startManagedTest(project, command, this.stateDirectory),
    );
  }

  public startWorker(
    project: Project,
    kind: WorkerKind,
    command: StartWorkerCommand,
  ): Promise<ManagedProcess> {
    return this.withStartLock(project.id, kind, () =>
      this.lifecycle.startManagedWorker(
        project,
        kind,
        command,
        this.stateDirectory,
      ),
    );
  }

  public stopServer(projectId: string): Promise<ManagedProcess> {
    return this.lifecycle.stopManagedProcess(projectId, 'server');
  }

  public stopTest(projectId: string): Promise<ManagedProcess> {
    return this.lifecycle.stopManagedProcess(projectId, 'test');
  }

  public stopWorker(
    projectId: string,
    kind: WorkerKind,
  ): Promise<ManagedProcess> {
    return this.lifecycle.stopManagedProcess(projectId, kind);
  }
}
