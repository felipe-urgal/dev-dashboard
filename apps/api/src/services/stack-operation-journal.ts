import { createHash, randomUUID } from 'node:crypto';
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

import type {
  ActivityJob,
  Stack,
  StackRestartResult,
  StackStartResult,
  StackStopResult,
} from '@dev-dashboard/contracts';

import { ApiError } from '../http/api-error.js';
import { stackRevision } from './stack-revision.js';

const DIRECTORY = 'stack-operations-v1';
const MAX_OPERATIONS = 1000;
const MAX_NODES = 200;
const MAX_FILE_BYTES = 64 * 1024;
const ID = /^[a-f0-9-]{36}$/;
const REVISION = /^[a-f0-9]{64}$/;

type Action = 'start' | 'stop' | 'restart';
type Result = StackStartResult | StackStopResult | StackRestartResult;

export interface StackOperationRecord {
  version: 1;
  id: string;
  stackId: string;
  projectIds: string[];
  action: Action;
  expectedRevision: string;
  plannedNodeIds: string[];
  status: 'running' | 'completed' | 'blocked' | 'failed' | 'interrupted';
  steps: { nodeId: string; state: string }[];
  startedAt: string;
  updatedAt: string;
  finishedAt?: string;
  reconciliationRequired: boolean;
}

function unavailable(): never {
  throw new ApiError({
    statusCode: 409,
    code: 'CONFLICT',
    message:
      'Stack operation journal is unavailable or requires reconciliation before retrying.',
  });
}

function valid(value: unknown): value is StackOperationRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const r = value as Partial<StackOperationRecord>;
  return (
    r.version === 1 &&
    typeof r.id === 'string' &&
    ID.test(r.id) &&
    typeof r.stackId === 'string' &&
    r.stackId.length > 0 &&
    r.stackId.length <= 160 &&
    Array.isArray(r.projectIds) &&
    r.projectIds.length > 0 &&
    r.projectIds.length <= MAX_NODES &&
    r.projectIds.every((id) => typeof id === 'string' && id.length > 0 && id.length <= 160) &&
    (r.action === 'start' || r.action === 'stop' || r.action === 'restart') &&
    typeof r.expectedRevision === 'string' &&
    REVISION.test(r.expectedRevision) &&
    Array.isArray(r.plannedNodeIds) &&
    r.plannedNodeIds.length > 0 &&
    r.plannedNodeIds.length <= MAX_NODES &&
    r.plannedNodeIds.every((id) => typeof id === 'string' && id.length > 0 && id.length <= 160) &&
    new Set(r.plannedNodeIds).size === r.plannedNodeIds.length &&
    ['running', 'completed', 'blocked', 'failed', 'interrupted'].includes(r.status ?? '') &&
    Array.isArray(r.steps) &&
    r.steps.length <= MAX_NODES &&
    r.steps.every(
      (step) =>
        step &&
        typeof step.nodeId === 'string' &&
        r.plannedNodeIds?.includes(step.nodeId) &&
        typeof step.state === 'string' &&
        /^(already-ready|already-stopped|started|stopped|retained|blocked|failed|restarted)$/.test(step.state),
    ) &&
    r.steps.every((step, index) => step.nodeId === r.plannedNodeIds?.[index]) &&
    typeof r.startedAt === 'string' &&
    !Number.isNaN(Date.parse(r.startedAt)) &&
    typeof r.updatedAt === 'string' &&
    !Number.isNaN(Date.parse(r.updatedAt)) &&
    (r.finishedAt === undefined ||
      (typeof r.finishedAt === 'string' && !Number.isNaN(Date.parse(r.finishedAt)))) &&
    typeof r.reconciliationRequired === 'boolean'
  );
}

/**
 * Metadata-only audit journal for HTTP-bound Stack operations.
 * Recording intent does not dispatch work, permit retry or grant host authority.
 * A lost writer remains uncertain; there is intentionally no automatic recovery.
 */
export class StackOperationJournal {
  private readonly directory: string;
  private readonly locks: string;
  private readonly now: () => Date;
  private readonly live = new Set<string>();

  public constructor(stateDirectory: string, options: { now?: () => Date } = {}) {
    const root = path.join(stateDirectory, DIRECTORY);
    this.directory = path.join(root, 'jobs');
    this.locks = path.join(root, 'locks');
    this.now = options.now ?? (() => new Date());
  }

  public begin(
    stack: Stack,
    action: Action,
    expectedRevision: string,
    plannedNodeIds: readonly string[],
  ): string {
    if (
      stackRevision(stack) !== expectedRevision ||
      !REVISION.test(expectedRevision) ||
      plannedNodeIds.length === 0 ||
      plannedNodeIds.length > MAX_NODES ||
      new Set(plannedNodeIds).size !== plannedNodeIds.length ||
      plannedNodeIds.some((id) => !stack.nodes.some((node) => node.id === id))
    ) unavailable();
    const projectIds = [...new Set(stack.nodes.map((node) => node.target.projectId))];
    if (projectIds.length === 0) unavailable();
    const id = randomUUID();
    const now = this.now().toISOString();
    const record: StackOperationRecord = {
      version: 1,
      id,
      stackId: stack.id,
      projectIds,
      action,
      expectedRevision,
      plannedNodeIds: [...plannedNodeIds],
      status: 'running',
      steps: [],
      startedAt: now,
      updatedAt: now,
      reconciliationRequired: false,
    };
    try {
      mkdirSync(this.directory, { recursive: true, mode: 0o700 });
      mkdirSync(this.locks, { recursive: true, mode: 0o700 });
      // Atomic claim within the shared filesystem: two API processes cannot
      // enter the same Stack concurrently. Orphaned claims are never reaped.
      mkdirSync(this.lock(stack.id), { mode: 0o700 });
      if (this.readAll().length >= MAX_OPERATIONS) unavailable();
      writeFileSync(this.file(id), JSON.stringify(record), {
        flag: 'wx',
        mode: 0o600,
      });
      this.live.add(id);
      return id;
    } catch {
      // An uncertain write must keep the claim, not silently allow replay.
      return unavailable();
    }
  }

  /** Only records the final backend response, never provider diagnostics. */
  public finish(id: string, result: Result): void {
    const previous = this.owned(id);
    if (result.stackId !== previous.stackId) unavailable();
    const steps =
      'steps' in result
        ? result.steps.map((step) => ({ nodeId: step.nodeId, state: step.state }))
        : [{ nodeId: result.nodeId, state: result.state }];
    if (
      steps.length > previous.plannedNodeIds.length ||
      steps.some((step, index) => step.nodeId !== previous.plannedNodeIds[index])
    ) unavailable();
    const status = result.state === 'restarted' || result.state === 'completed'
      ? 'completed'
      : result.state;
    const record: StackOperationRecord = {
      ...previous,
      steps,
      status,
      updatedAt: this.now().toISOString(),
      finishedAt: this.now().toISOString(),
      reconciliationRequired: status !== 'completed',
    };
    if (!valid(record)) unavailable();
    this.persist(record);
    this.live.delete(id);
    if (status === 'completed') {
      try {
        rmdirSync(this.lock(record.stackId));
      } catch {
        // An orphaned claim remains fail-closed on the next operation.
      }
    }
  }

  /** Unknown outcome: do not unlock or claim a rollback occurred. */
  public interrupted(id: string): void {
    if (!this.live.has(id)) return;
    const previous = this.owned(id);
    this.persist({
      ...previous,
      status: 'interrupted',
      reconciliationRequired: true,
      updatedAt: this.now().toISOString(),
      finishedAt: this.now().toISOString(),
    });
    this.live.delete(id);
  }

  public get(id: string): StackOperationRecord | null {
    if (!ID.test(id)) return null;
    try {
      if (statSync(this.file(id)).size > MAX_FILE_BYTES) unavailable();
      const record: unknown = JSON.parse(readFileSync(this.file(id), 'utf8'));
      if (!valid(record) || record.id !== id) unavailable();
      return {
        ...record,
        reconciliationRequired:
          record.reconciliationRequired ||
          (record.status === 'running' && !this.live.has(id)),
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      return unavailable();
    }
  }

  public list(stackId?: string): StackOperationRecord[] {
    return this.readAll()
      .filter((record) => !stackId || record.stackId === stackId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  public activityJobs(projectId: string): ActivityJob[] {
    return this.list()
      .filter((record) =>
        record.projectIds.includes(projectId) &&
        (record.status === 'running' || record.reconciliationRequired),
      )
      .map((record) => ({
        id: 'stack-operation:' + record.id,
        projectId,
        domain: 'stack',
        action: 'Stack ' + record.action,
        status: record.reconciliationRequired ? 'failed' : 'running',
        startedAt: record.startedAt,
        ...(record.finishedAt ? { finishedAt: record.finishedAt } : {}),
        resourceRef: { kind: 'stack-operation', id: record.stackId },
        stage: record.reconciliationRequired ? 'reconciliation-required' : 'request-in-flight',
        stageStartedAt: record.updatedAt,
        timingIncomplete: record.reconciliationRequired,
        cancelSupported: false,
      }));
  }

  private owned(id: string): StackOperationRecord {
    if (!this.live.has(id)) unavailable();
    const record = this.get(id);
    if (!record || record.status !== 'running') unavailable();
    return record;
  }

  private readAll(): StackOperationRecord[] {
    let names: string[];
    try {
      names = readdirSync(this.directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      return unavailable();
    }
    if (
      names.length > MAX_OPERATIONS ||
      names.some((name) => !name.endsWith('.json') || !ID.test(name.slice(0, -5)))
    ) unavailable();
    return names.map((name) => {
      const record = this.get(name.slice(0, -5));
      if (!record) unavailable();
      return record;
    });
  }

  private persist(record: StackOperationRecord): void {
    const data = JSON.stringify(record);
    if (Buffer.byteLength(data, 'utf8') > MAX_FILE_BYTES) unavailable();
    const temp = this.file(record.id) + '.' + randomUUID() + '.tmp';
    try {
      writeFileSync(temp, data, { flag: 'wx', mode: 0o600 });
      renameSync(temp, this.file(record.id));
    } catch {
      unavailable();
    }
  }

  private file(id: string): string {
    return path.join(this.directory, id + '.json');
  }

  private lock(stackId: string): string {
    return path.join(
      this.locks,
      createHash('sha256').update(stackId).digest('hex'),
    );
  }
}
