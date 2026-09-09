import { randomUUID } from 'node:crypto';

import type { Project } from '@dev-dashboard/contracts';

import type {
  DetachableExecutionService,
  DetachableExecutionSnapshot,
} from './detachable-execution-service.js';
import { buildActJobCommand, type LocalCiJobRequest } from './local-ci-act.js';
import type { LocalCiDiscoveryService } from './local-ci-discovery-service.js';

const DEFAULT_TIMEOUT_MS = 30 * 60_000;
const DEFAULT_MAX_CONCURRENT = 2;
const MAX_RETAINED_RUNS = 64;
const SAFE_ENV_KEYS = [
  'PATH',
  'HOME',
  'USER',
  'LOGNAME',
  'SHELL',
  'TMPDIR',
  'XDG_RUNTIME_DIR',
  'DOCKER_HOST',
  'DOCKER_CONTEXT',
] as const;

export type LocalCiExecutionErrorCode =
  'LOCAL_CI_BUSY' | 'LOCAL_CI_NOT_FOUND' | 'LOCAL_CI_NOT_RUNNING';

export class LocalCiExecutionError extends Error {
  public constructor(
    public readonly code: LocalCiExecutionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'LocalCiExecutionError';
  }
}

export interface LocalCiExecutionSnapshot {
  id: string;
  projectId: string;
  provider: 'act';
  approximation: true;
  request: LocalCiJobRequest;
  status: DetachableExecutionSnapshot['status'];
  logs: string;
  truncated: boolean;
  exitCode: number | null;
  exitSignal: number | null;
  timedOut: boolean;
  startedAt: string;
  endedAt: string | null;
}

export interface LocalCiExecutionAttachment {
  snapshot: LocalCiExecutionSnapshot;
  detach: () => void;
}

interface RunRecord {
  id: string;
  projectId: string;
  key: string;
  request: LocalCiJobRequest;
  timedOut: boolean;
  timeout: ReturnType<typeof setTimeout> | null;
  detach: (() => void) | null;
}

export interface LocalCiExecutionServiceOptions {
  timeoutMs?: number;
  maxConcurrent?: number;
  createId?: () => string;
  environment?: NodeJS.ProcessEnv;
}

function isolatedEnvironment(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const isolated = Object.fromEntries(
    Object.keys(source).map((key) => [key, undefined]),
  ) as NodeJS.ProcessEnv;

  for (const key of SAFE_ENV_KEYS) {
    const value = source[key];
    if (value !== undefined) isolated[key] = value;
  }
  isolated.CI = 'true';
  return isolated;
}

export class LocalCiExecutionService {
  private readonly runs = new Map<string, RunRecord>();
  private readonly timeoutMs: number;
  private readonly maxConcurrent: number;
  private readonly createId: () => string;
  private readonly environment: NodeJS.ProcessEnv;

  public constructor(
    private readonly discovery: Pick<LocalCiDiscoveryService, 'discover'>,
    private readonly executions: Pick<
      DetachableExecutionService,
      'start' | 'attach' | 'snapshotOf' | 'cancel'
    >,
    options: LocalCiExecutionServiceOptions = {},
  ) {
    this.timeoutMs = Math.max(1_000, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    this.maxConcurrent = Math.max(
      1,
      Math.floor(options.maxConcurrent ?? DEFAULT_MAX_CONCURRENT),
    );
    this.createId = options.createId ?? randomUUID;
    this.environment = isolatedEnvironment(options.environment ?? process.env);
  }

  public async start(
    project: Project,
    request: LocalCiJobRequest,
  ): Promise<LocalCiExecutionSnapshot> {
    if (this.runningCount() >= this.maxConcurrent) {
      throw new LocalCiExecutionError(
        'LOCAL_CI_BUSY',
        'Limite de execuções locais simultâneas atingido.',
      );
    }

    const catalog = await this.discovery.discover(project);
    const command = buildActJobCommand(catalog, request);
    const id = this.createId();
    const key = `local-ci:${project.id}:${id}`;
    const record: RunRecord = {
      id,
      projectId: project.id,
      key,
      request: { ...request },
      timedOut: false,
      timeout: null,
      detach: null,
    };

    const started = this.executions.start(key, {
      file: command.program,
      args: command.args,
      cwd: project.path,
      env: this.environment,
    });
    this.runs.set(id, record);

    const handle = this.executions.attach(
      key,
      () => undefined,
      () => this.finish(record),
    );
    record.detach = handle.detach;
    record.timeout = setTimeout(() => {
      if (!this.isRunning(record)) return;
      record.timedOut = true;
      this.executions.cancel(record.key);
    }, this.timeoutMs);
    record.timeout.unref();

    this.pruneRuns();
    return this.toSnapshot(record, started);
  }

  public get(projectId: string, id: string): LocalCiExecutionSnapshot {
    const record = this.ownedRun(projectId, id);
    const snapshot = this.executions.snapshotOf(record.key);
    if (!snapshot) {
      this.deleteRun(record);
      throw new LocalCiExecutionError(
        'LOCAL_CI_NOT_FOUND',
        'Execução local não está mais disponível.',
      );
    }
    return this.toSnapshot(record, snapshot);
  }

  /**
   * Reanexa a uma execução pertencente ao projeto. O buffer atual vem no
   * snapshot; novos chunks e o exit são encaminhados sem criar outro processo.
   * Detach remove somente os listeners deste consumidor.
   */
  public reattach(
    projectId: string,
    id: string,
    onData: (chunk: string) => void,
    onExit: (snapshot: LocalCiExecutionSnapshot) => void,
  ): LocalCiExecutionAttachment {
    const record = this.ownedRun(projectId, id);
    try {
      const handle = this.executions.attach(record.key, onData, (snapshot) => {
        onExit(this.toSnapshot(record, snapshot));
      });
      return {
        snapshot: this.toSnapshot(record, handle.snapshot),
        detach: handle.detach,
      };
    } catch {
      this.deleteRun(record);
      throw new LocalCiExecutionError(
        'LOCAL_CI_NOT_FOUND',
        'Execução local não está mais disponível.',
      );
    }
  }

  public cancel(projectId: string, id: string): LocalCiExecutionSnapshot {
    const record = this.ownedRun(projectId, id);
    const snapshot = this.executions.snapshotOf(record.key);
    if (!snapshot) {
      this.deleteRun(record);
      throw new LocalCiExecutionError(
        'LOCAL_CI_NOT_FOUND',
        'Execução local não está mais disponível.',
      );
    }
    if (snapshot.status !== 'running') {
      throw new LocalCiExecutionError(
        'LOCAL_CI_NOT_RUNNING',
        'Execução local já terminou.',
      );
    }
    this.executions.cancel(record.key);
    return this.toSnapshot(record, snapshot);
  }

  public shutdown(): void {
    for (const record of this.runs.values()) {
      if (this.isRunning(record)) this.executions.cancel(record.key);
      this.clearLifecycle(record);
    }
  }

  private ownedRun(projectId: string, id: string): RunRecord {
    const record = this.runs.get(id);
    if (!record || record.projectId !== projectId) {
      throw new LocalCiExecutionError(
        'LOCAL_CI_NOT_FOUND',
        'Execução local não encontrada para este projeto.',
      );
    }
    return record;
  }

  private runningCount(): number {
    let total = 0;
    for (const record of this.runs.values()) {
      if (this.isRunning(record)) total += 1;
    }
    return total;
  }

  private isRunning(record: RunRecord): boolean {
    return this.executions.snapshotOf(record.key)?.status === 'running';
  }

  private finish(record: RunRecord): void {
    this.clearLifecycle(record);
    this.pruneRuns();
  }

  private clearLifecycle(record: RunRecord): void {
    if (record.timeout) clearTimeout(record.timeout);
    record.timeout = null;
    record.detach?.();
    record.detach = null;
  }

  private deleteRun(record: RunRecord): void {
    this.clearLifecycle(record);
    if (this.runs.get(record.id) === record) this.runs.delete(record.id);
  }

  private pruneRuns(): void {
    if (this.runs.size <= MAX_RETAINED_RUNS) return;
    for (const record of this.runs.values()) {
      if (this.runs.size <= MAX_RETAINED_RUNS) break;
      if (!this.isRunning(record)) this.deleteRun(record);
    }
  }

  private toSnapshot(
    record: RunRecord,
    snapshot: DetachableExecutionSnapshot,
  ): LocalCiExecutionSnapshot {
    return {
      id: record.id,
      projectId: record.projectId,
      provider: 'act',
      approximation: true,
      request: { ...record.request },
      status: snapshot.status,
      logs: snapshot.buffer,
      truncated: snapshot.truncated,
      exitCode: snapshot.exitCode,
      exitSignal: snapshot.exitSignal,
      timedOut: record.timedOut,
      startedAt: snapshot.startedAt,
      endedAt: snapshot.endedAt,
    };
  }
}
