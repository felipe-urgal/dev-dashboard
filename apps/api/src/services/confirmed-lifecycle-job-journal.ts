import { randomUUID } from 'node:crypto';
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

import type {
  ActivityJob,
  ConfirmedLifecycleRequest,
  ConfirmedLifecycleResult,
  ConfirmedLifecycleStep,
} from '@dev-dashboard/contracts';

import { ApiError } from '../http/api-error.js';

const DIRECTORY = 'confirmed-lifecycle-jobs-v1';
const MAX_JOBS = 1000;
const MAX_FILE_BYTES = 64 * 1024;
const MAX_STEPS = 200;
const ID = /^[a-f0-9-]{36}$/;

export interface ConfirmedLifecycleJob {
  version: 1;
  id: string;
  projectId: string;
  environmentInstanceId: string;
  action: 'start' | 'stop';
  expectedRevision: string;
  expectedPlanHash: string;
  status: 'running' | 'completed' | 'failed' | 'partial';
  stage: 'prepared' | 'invoking' | 'verifying' | 'finished';
  plannedRefs: string[];
  inFlightRef?: string | undefined;
  steps: ConfirmedLifecycleStep[];
  startedAt: string;
  updatedAt: string;
  finishedAt?: string;
  /** Non-terminal records may be from a live process OR an interrupted one. */
  reconciliationRequired: boolean;
}

function unavailable(): never {
  throw new ApiError({
    statusCode: 409,
    code: 'CONFLICT',
    message: 'Lifecycle job journal is unavailable; reconcile before retrying.',
  });
}

function valid(record: unknown): record is ConfirmedLifecycleJob {
  if (!record || typeof record !== 'object' || Array.isArray(record))
    return false;
  const r = record as Partial<ConfirmedLifecycleJob>;
  return (
    r.version === 1 &&
    typeof r.id === 'string' &&
    ID.test(r.id) &&
    typeof r.projectId === 'string' &&
    r.projectId.length <= 160 &&
    typeof r.environmentInstanceId === 'string' &&
    r.environmentInstanceId.length <= 512 &&
    (r.action === 'start' || r.action === 'stop') &&
    typeof r.expectedRevision === 'string' &&
    /^[a-f0-9]{64}$/.test(r.expectedRevision) &&
    typeof r.expectedPlanHash === 'string' &&
    /^[a-f0-9]{64}$/.test(r.expectedPlanHash) &&
    ['running', 'completed', 'failed', 'partial'].includes(r.status ?? '') &&
    ['prepared', 'invoking', 'verifying', 'finished'].includes(r.stage ?? '') &&
    Array.isArray(r.plannedRefs) &&
    r.plannedRefs.length <= MAX_STEPS &&
    r.plannedRefs.every((s) => typeof s === 'string' && s.length <= 512) &&
    Array.isArray(r.steps) &&
    r.steps.length <= MAX_STEPS &&
    r.steps.every(
      (s) =>
        s &&
        typeof s === 'object' &&
        typeof s.serviceRef === 'string' &&
        s.serviceRef.length <= 512 &&
        (s.state === 'completed' ||
          s.state === 'failed' ||
          s.state === 'unverified'),
    ) &&
    (r.inFlightRef === undefined ||
      (typeof r.inFlightRef === 'string' &&
        r.plannedRefs.includes(r.inFlightRef))) &&
    typeof r.startedAt === 'string' &&
    !Number.isNaN(Date.parse(r.startedAt)) &&
    typeof r.updatedAt === 'string' &&
    !Number.isNaN(Date.parse(r.updatedAt)) &&
    (r.finishedAt === undefined ||
      (typeof r.finishedAt === 'string' &&
        !Number.isNaN(Date.parse(r.finishedAt)))) &&
    typeof r.reconciliationRequired === 'boolean'
  );
}

/**
 * Durable, metadata-only journal for the *internal* confirmed coordinator.
 *
 * One writer (the originating process) owns each UUID job. Other API processes
 * read these immutable identities. No job is ever replayed automatically.
 * A non-terminal job found after restart is UNVERIFIED, not safe to retry.
 */
export class ConfirmedLifecycleJobJournal {
  private readonly directory: string;
  private readonly live = new Set<string>();
  private readonly now: () => Date;

  public constructor(
    stateDirectory: string,
    options: { now?: () => Date } = {},
  ) {
    this.directory = path.join(stateDirectory, DIRECTORY);
    this.now = options.now ?? (() => new Date());
  }

  public begin(
    request: ConfirmedLifecycleRequest,
    plannedRefs: readonly string[],
  ): string {
    if (
      plannedRefs.length > MAX_STEPS ||
      plannedRefs.some((ref) => !ref || ref.length > 512)
    )
      unavailable();
    const records = this.readAll();
    if (records.length >= MAX_JOBS) unavailable();
    // Refuse a new operation in an environment with an unreconciled record.
    // Terminal records do not block unrelated future operations.
    if (
      records.some(
        (record) =>
          record.projectId === request.projectId &&
          record.environmentInstanceId === request.environmentInstanceId &&
          record.status === 'running',
      )
    )
      unavailable();

    const id = randomUUID();
    const time = this.now().toISOString();
    const job: ConfirmedLifecycleJob = {
      version: 1,
      id,
      projectId: request.projectId,
      environmentInstanceId: request.environmentInstanceId,
      action: request.action,
      expectedRevision: request.expectedRevision,
      expectedPlanHash: request.expectedPlanHash,
      status: 'running',
      stage: 'prepared',
      plannedRefs: [...plannedRefs],
      steps: [],
      startedAt: time,
      updatedAt: time,
      reconciliationRequired: false,
    };
    try {
      mkdirSync(this.directory, { recursive: true, mode: 0o700 });
      // Atomic create; no overwriting an existing job.
      writeFileSync(this.file(id), JSON.stringify(job), {
        flag: 'wx',
        mode: 0o600,
      });
    } catch {
      unavailable();
    }
    this.live.add(id);
    return id;
  }

  public beforeStep(id: string, serviceRef: string): void {
    const record = this.owned(id);
    if (
      record.status !== 'running' ||
      record.inFlightRef ||
      !record.plannedRefs.includes(serviceRef) ||
      record.steps.some((step) => step.serviceRef === serviceRef)
    )
      unavailable();
    this.persist({ ...record, stage: 'invoking', inFlightRef: serviceRef });
  }

  public step(id: string, step: ConfirmedLifecycleStep): void {
    const record = this.owned(id);
    if (
      record.status !== 'running' ||
      record.inFlightRef !== step.serviceRef ||
      record.steps.length >= MAX_STEPS
    )
      unavailable();
    this.persist({
      ...record,
      stage: 'verifying',
      inFlightRef: undefined,
      steps: [
        ...record.steps,
        {
          serviceRef: step.serviceRef,
          action: step.action,
          state: step.state,
          dispositionBefore: step.dispositionBefore,
          // Runtime diagnostic text is never persisted in this journal.
        },
      ],
    });
  }

  public finish(id: string, result: ConfirmedLifecycleResult): void {
    const record = this.owned(id);
    if (
      record.status !== 'running' ||
      record.inFlightRef ||
      record.projectId !== result.projectId ||
      record.environmentInstanceId !== result.environmentInstanceId ||
      record.action !== result.action ||
      JSON.stringify(record.steps.map((s) => [s.serviceRef, s.state])) !==
        JSON.stringify(result.steps.map((s) => [s.serviceRef, s.state]))
    )
      unavailable();
    this.persist({
      ...record,
      status: result.status,
      stage: 'finished',
      finishedAt: this.now().toISOString(),
      reconciliationRequired: result.status !== 'completed',
    });
    this.live.delete(id);
  }

  /** No reconciliation side effects. A previous writer may still be alive. */
  public get(id: string): ConfirmedLifecycleJob | null {
    if (!ID.test(id)) return null;
    try {
      const file = this.file(id);
      const size = statSync(file).size;
      if (size > MAX_FILE_BYTES) unavailable();
      const item: unknown = JSON.parse(readFileSync(file, 'utf8'));
      if (!valid(item) || item.id !== id) unavailable();
      return {
        ...item,
        reconciliationRequired:
          (item.status === 'running' && !this.live.has(id)) ||
          item.reconciliationRequired,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      return unavailable();
    }
  }

  public list(projectId?: string): ConfirmedLifecycleJob[] {
    return this.readAll()
      .filter((job) => !projectId || job.projectId === projectId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .map((job) => ({
        ...job,
        reconciliationRequired:
          job.reconciliationRequired ||
          (job.status === 'running' && !this.live.has(job.id)),
      }));
  }

  /** Reuses existing ActivitySnapshotService readers; no new public mutation route. */
  public activityJobs(projectId: string): ActivityJob[] {
    return this.list(projectId)
      .filter((job) => job.status === 'running')
      .map((job) => ({
        id: 'compose-confirmed:' + job.id,
        projectId: job.projectId,
        environmentInstanceId: job.environmentInstanceId,
        domain: 'compose',
        action: 'Lifecycle ' + job.action,
        status: job.reconciliationRequired ? 'failed' : 'running',
        startedAt: job.startedAt,
        resourceRef: { kind: 'docker-compose-lifecycle', id: job.id },
        stage: job.reconciliationRequired
          ? 'reconciliation-required'
          : job.stage,
        stageStartedAt: job.updatedAt,
        timingIncomplete: job.reconciliationRequired,
        cancelSupported: false,
      }));
  }

  private owned(id: string): ConfirmedLifecycleJob {
    if (!this.live.has(id)) unavailable();
    const record = this.get(id);
    if (!record) unavailable();
    return record;
  }

  private readAll(): ConfirmedLifecycleJob[] {
    let names: string[];
    try {
      names = readdirSync(this.directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      return unavailable();
    }
    if (
      names.length > MAX_JOBS ||
      names.some(
        (name) =>
          !ID.test(name.replace(/\.json$/, '')) || !name.endsWith('.json'),
      )
    )
      unavailable();
    return names.map((name) => {
      const job = this.get(name.slice(0, -5));
      if (!job) unavailable();
      return job;
    });
  }

  private persist(record: ConfirmedLifecycleJob): void {
    const previous = this.owned(record.id);
    if (previous.status !== 'running') unavailable();
    const time = this.now().toISOString();
    const data = JSON.stringify({ ...record, updatedAt: time });
    if (Buffer.byteLength(data) > MAX_FILE_BYTES) unavailable();
    const temp = this.file(record.id) + '.' + randomUUID() + '.tmp';
    try {
      writeFileSync(temp, data, { flag: 'wx', mode: 0o600 });
      renameSync(temp, this.file(record.id));
    } catch {
      // Do not mask an uncertain journal write as a successful mutation.
      unavailable();
    }
  }

  private file(id: string): string {
    return path.join(this.directory, id + '.json');
  }
}
