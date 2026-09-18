import path from 'node:path';

import type {
  ExecutionContext,
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
    environmentInstanceId?: string,
  ): Promise<T> {
    const key = `${projectId}:${environmentInstanceId ?? 'legacy'}:${kind}`;
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

  public getServerProcess(
    projectId: string,
    environmentInstanceId?: string,
  ): Promise<ManagedProcess | null> {
    return this.statusReader.getManagedProcess(
      projectId,
      'server',
      environmentInstanceId,
    );
  }

  public getTestProcess(
    projectId: string,
    environmentInstanceId?: string,
  ): Promise<ManagedProcess | null> {
    return this.statusReader.getManagedProcess(
      projectId,
      'test',
      environmentInstanceId,
    );
  }

  public getWorkerProcess(
    projectId: string,
    kind: WorkerKind,
    environmentInstanceId?: string,
  ): Promise<ManagedProcess | null> {
    return this.statusReader.getManagedProcess(
      projectId,
      kind,
      environmentInstanceId,
    );
  }

  public listProcesses(): Promise<ManagedProcess[]> {
    return this.statusReader.listProcesses();
  }

  public readServerLog(
    projectId: string,
    options: ReadServerLogOptions = {},
    environmentInstanceId?: string,
  ): Promise<ProcessLogSnapshot> {
    return readManagedLog(
      this.context,
      projectId,
      'server',
      options,
      environmentInstanceId,
    );
  }

  public readTestLog(
    projectId: string,
    options: ReadServerLogOptions = {},
    environmentInstanceId?: string,
  ): Promise<ProcessLogSnapshot> {
    return readManagedLog(
      this.context,
      projectId,
      'test',
      options,
      environmentInstanceId,
    );
  }

  public clearServerLog(
    projectId: string,
    environmentInstanceId?: string,
  ): Promise<ProcessLogSnapshot> {
    return clearManagedLog(
      this.context,
      projectId,
      'server',
      environmentInstanceId,
    );
  }

  public clearTestLog(
    projectId: string,
    environmentInstanceId?: string,
  ): Promise<ProcessLogSnapshot> {
    return clearManagedLog(
      this.context,
      projectId,
      'test',
      environmentInstanceId,
    );
  }

  public readWorkerLog(
    projectId: string,
    kind: WorkerKind,
    options: ReadServerLogOptions = {},
    environmentInstanceId?: string,
  ): Promise<ProcessLogSnapshot> {
    return readManagedLog(
      this.context,
      projectId,
      kind,
      options,
      environmentInstanceId,
    );
  }

  public clearWorkerLog(
    projectId: string,
    kind: WorkerKind,
    environmentInstanceId?: string,
  ): Promise<ProcessLogSnapshot> {
    return clearManagedLog(
      this.context,
      projectId,
      kind,
      environmentInstanceId,
    );
  }

  public startServer(
    project: Project,
    options: StartServerOptions = {},
  ): Promise<ManagedProcess> {
    return this.withStartLock(
      project.id,
      'server',
      () =>
        this.lifecycle.startManagedServer(
          project,
          options,
          this.stateDirectory,
        ),
      options.executionContext?.environmentInstanceId,
    );
  }

  public startTest(
    project: Project,
    command: { id: string; command: string; args: string[] },
    executionContext?: ExecutionContext,
  ): Promise<ManagedProcess> {
    return this.withStartLock(
      project.id,
      'test',
      () =>
        this.lifecycle.startManagedTest(
          project,
          command,
          this.stateDirectory,
          executionContext,
        ),
      executionContext?.environmentInstanceId,
    );
  }

  public startWorker(
    project: Project,
    kind: WorkerKind,
    command: StartWorkerCommand,
    executionContext?: ExecutionContext,
  ): Promise<ManagedProcess> {
    return this.withStartLock(
      project.id,
      kind,
      () =>
        this.lifecycle.startManagedWorker(
          project,
          kind,
          command,
          this.stateDirectory,
          executionContext,
        ),
      executionContext?.environmentInstanceId,
    );
  }

  public stopServer(
    projectId: string,
    environmentInstanceId?: string,
  ): Promise<ManagedProcess> {
    return this.lifecycle.stopManagedProcess(
      projectId,
      'server',
      environmentInstanceId,
    );
  }

  public stopTest(
    projectId: string,
    environmentInstanceId?: string,
  ): Promise<ManagedProcess> {
    return this.lifecycle.stopManagedProcess(
      projectId,
      'test',
      environmentInstanceId,
    );
  }

  public stopWorker(
    projectId: string,
    kind: WorkerKind,
    environmentInstanceId?: string,
  ): Promise<ManagedProcess> {
    return this.lifecycle.stopManagedProcess(
      projectId,
      kind,
      environmentInstanceId,
    );
  }
}
