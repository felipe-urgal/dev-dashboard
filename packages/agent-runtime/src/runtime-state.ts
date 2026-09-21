import { createHash, randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { AgentTaskRecord } from './contracts.js';

export type AgentRuntimeStateKind = 'idle' | 'running' | 'interrupted';

export type AgentRuntimeRecoveryReason =
  | 'process-interrupted'
  | 'canonical-task-advanced'
  | 'operator-recovered';

export interface AgentRuntimeState {
  taskId: string;
  projectId: string;
  canonicalVersion: number;
  state: AgentRuntimeStateKind;
  executionId?: string;
  processId?: number;
  attempts: number;
  startedAt?: string;
  updatedAt: string;
  lastReason?: AgentRuntimeRecoveryReason;
}

export interface AgentRuntimeStateStoreOptions {
  stateDirectory: string;
  processId?: number;
  isProcessAlive?: (processId: number) => boolean;
  now?: () => Date;
}

function defaultIsProcessAlive(processId: number): boolean {
  try {
    process.kill(processId, 0);
    return true;
  } catch (error) {
    return !(
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: unknown }).code === 'ESRCH'
    );
  }
}

function runtimeStateKey(record: Pick<AgentTaskRecord, 'task'>): string {
  return createHash('sha256')
    .update(record.task.projectId)
    .update('\0')
    .update(record.task.id)
    .digest('hex');
}

function isRuntimeState(value: unknown): value is AgentRuntimeState {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.taskId === 'string' &&
    candidate.taskId.length > 0 &&
    typeof candidate.projectId === 'string' &&
    candidate.projectId.length > 0 &&
    Number.isSafeInteger(candidate.canonicalVersion) &&
    (candidate.canonicalVersion as number) >= 0 &&
    (candidate.state === 'idle' ||
      candidate.state === 'running' ||
      candidate.state === 'interrupted') &&
    Number.isSafeInteger(candidate.attempts) &&
    (candidate.attempts as number) >= 0 &&
    (candidate.executionId === undefined ||
      (typeof candidate.executionId === 'string' &&
        candidate.executionId.length > 0)) &&
    (candidate.processId === undefined ||
      (Number.isSafeInteger(candidate.processId) &&
        (candidate.processId as number) > 0)) &&
    typeof candidate.updatedAt === 'string' &&
    Number.isFinite(Date.parse(candidate.updatedAt)) &&
    (candidate.startedAt === undefined ||
      (typeof candidate.startedAt === 'string' &&
        Number.isFinite(Date.parse(candidate.startedAt)))) &&
    (candidate.lastReason === undefined ||
      candidate.lastReason === 'process-interrupted' ||
      candidate.lastReason === 'canonical-task-advanced' ||
      candidate.lastReason === 'operator-recovered')
  );
}

function emptyState(
  record: AgentTaskRecord,
  observedAt: string,
): AgentRuntimeState {
  return {
    taskId: record.task.id,
    projectId: record.task.projectId,
    canonicalVersion: record.version,
    state: 'idle',
    attempts: 0,
    updatedAt: observedAt,
  };
}

export class AgentRuntimeStateStore {
  private readonly processId: number;
  private readonly isProcessAlive: (processId: number) => boolean;
  private readonly now: () => Date;

  public constructor(private readonly options: AgentRuntimeStateStoreOptions) {
    if (!options.stateDirectory) {
      throw new Error('Agent runtime state directory is required.');
    }

    this.processId = options.processId ?? process.pid;
    this.isProcessAlive = options.isProcessAlive ?? defaultIsProcessAlive;
    this.now = options.now ?? (() => new Date());
  }

  public async read(record: AgentTaskRecord): Promise<AgentRuntimeState> {
    const observedAt = this.now().toISOString();

    try {
      const parsed: unknown = JSON.parse(
        await fs.readFile(this.pathFor(record), 'utf8'),
      );
      if (!isRuntimeState(parsed)) {
        throw new Error('Agent runtime state is invalid.');
      }
      if (
        parsed.taskId !== record.task.id ||
        parsed.projectId !== record.task.projectId
      ) {
        throw new Error('Agent runtime state ownership does not match task.');
      }
      return parsed;
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code?: unknown }).code === 'ENOENT'
      ) {
        return emptyState(record, observedAt);
      }
      throw error;
    }
  }

  public async markRunning(
    record: AgentTaskRecord,
    executionId: string,
  ): Promise<AgentRuntimeState> {
    if (!executionId) {
      throw new Error('Agent execution id is required.');
    }

    const previous = await this.read(record);
    const canonicalAdvanced = previous.canonicalVersion !== record.version;
    const observedAt = this.now().toISOString();

    return this.write(record, {
      ...previous,
      canonicalVersion: record.version,
      state: 'running',
      executionId,
      processId: this.processId,
      attempts: canonicalAdvanced ? 0 : previous.attempts,
      startedAt: observedAt,
      updatedAt: observedAt,
    });
  }

  public async recordAttempt(
    record: AgentTaskRecord,
  ): Promise<AgentRuntimeState> {
    const previous = await this.read(record);
    const observedAt = this.now().toISOString();

    return this.write(record, {
      ...previous,
      canonicalVersion: record.version,
      attempts:
        previous.canonicalVersion === record.version
          ? previous.attempts + 1
          : 1,
      updatedAt: observedAt,
    });
  }

  public async recoverInterrupted(
    records: readonly AgentTaskRecord[],
  ): Promise<string[]> {
    const recovered: string[] = [];
    const recordsByIdentity = new Map(
      records.map((record) => [
        `${record.task.projectId}\0${record.task.id}`,
        record,
      ]),
    );

    for (const persisted of await this.list()) {
      if (persisted.state !== 'running') continue;
      if (
        persisted.processId !== undefined &&
        this.isProcessAlive(persisted.processId)
      ) {
        continue;
      }

      const record = recordsByIdentity.get(
        `${persisted.projectId}\0${persisted.taskId}`,
      );
      if (!record) continue;

      const observedAt = this.now().toISOString();
      if (persisted.canonicalVersion !== record.version) {
        await this.write(record, {
          ...emptyState(record, observedAt),
          lastReason: 'canonical-task-advanced',
        });
      } else {
        const next: AgentRuntimeState = {
          ...persisted,
          state: 'interrupted',
          updatedAt: observedAt,
          lastReason: 'process-interrupted',
        };
        delete next.processId;
        await this.write(record, next);
      }

      recovered.push(record.task.id);
    }

    return recovered;
  }

  public async recoverTask(
    record: AgentTaskRecord,
  ): Promise<AgentRuntimeState> {
    const previous = await this.read(record);
    if (previous.state !== 'interrupted') {
      throw new Error('Agent task is not interrupted.');
    }

    const observedAt = this.now().toISOString();
    return this.write(record, {
      ...emptyState(record, observedAt),
      lastReason: 'operator-recovered',
    });
  }

  private runtimeDirectory(): string {
    return path.join(this.options.stateDirectory, 'runtime');
  }

  private pathFor(record: Pick<AgentTaskRecord, 'task'>): string {
    return path.join(this.runtimeDirectory(), `${runtimeStateKey(record)}.json`);
  }

  private async list(): Promise<AgentRuntimeState[]> {
    let names: string[];
    try {
      names = await fs.readdir(this.runtimeDirectory());
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code?: unknown }).code === 'ENOENT'
      ) {
        return [];
      }
      throw error;
    }

    const states: AgentRuntimeState[] = [];
    for (const name of names.filter((entry) => entry.endsWith('.json')).sort()) {
      const parsed: unknown = JSON.parse(
        await fs.readFile(path.join(this.runtimeDirectory(), name), 'utf8'),
      );
      if (!isRuntimeState(parsed)) {
        throw new Error('Agent runtime state is invalid.');
      }
      states.push(parsed);
    }
    return states;
  }

  private async write(
    record: Pick<AgentTaskRecord, 'task'>,
    state: AgentRuntimeState,
  ): Promise<AgentRuntimeState> {
    const directory = this.runtimeDirectory();
    const target = this.pathFor(record);
    const temporary = `${target}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;

    await fs.mkdir(directory, { recursive: true, mode: 0o700 });

    try {
      await fs.writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, {
        encoding: 'utf8',
        mode: 0o600,
      });
      await fs.rename(temporary, target);
    } finally {
      await fs.unlink(temporary).catch((error: unknown) => {
        if (
          !(
            error &&
            typeof error === 'object' &&
            'code' in error &&
            (error as { code?: unknown }).code === 'ENOENT'
          )
        ) {
          throw error;
        }
      });
    }

    return state;
  }
}
