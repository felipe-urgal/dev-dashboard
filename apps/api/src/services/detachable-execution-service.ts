import * as pty from 'node-pty';
import type { IPty } from 'node-pty';

import { maskSensitiveLogContent } from '@dev-dashboard/process-manager';

const DEFAULT_BUFFER_LIMIT_BYTES = 262_144; // mesmo teto já usado em toda leitura de log do dashboard
const DEFAULT_EXITED_TTL_MS = 30 * 60_000;
const DEFAULT_MAX_RETAINED_EXITED = 32;
const KILL_ESCALATION_MS = 1_000; // TERM → espera → KILL, mesmo padrão do `dev-stop` do CLI bash
const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;

export type DetachableExecutionStatus = 'running' | 'exited';

export interface DetachableExecutionSnapshot {
  status: DetachableExecutionStatus;
  buffer: string;
  truncated: boolean;
  exitCode: number | null;
  exitSignal: number | null;
  startedAt: string;
  endedAt: string | null;
}

export interface StartExecutionOptions {
  file: string;
  args: readonly string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  cols?: number;
  rows?: number;
}

export type DetachableExecutionErrorCode = 'ALREADY_RUNNING' | 'NOT_FOUND';

export class DetachableExecutionError extends Error {
  public constructor(
    public readonly code: DetachableExecutionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DetachableExecutionError';
  }
}

interface Disposable {
  dispose(): void;
}

interface ExecutionRecord {
  proc: IPty | null;
  status: DetachableExecutionStatus;
  chunks: string[];
  bufferedBytes: number;
  truncated: boolean;
  exitCode: number | null;
  exitSignal: number | null;
  startedAt: string;
  endedAt: string | null;
  endedAtMs: number | null;
  lastAccessedAtMs: number;
  dataListeners: Set<(chunk: string) => void>;
  exitListeners: Set<(snapshot: DetachableExecutionSnapshot) => void>;
  dataSubscription: Disposable | null;
  exitSubscription: Disposable | null;
  killEscalation: ReturnType<typeof setTimeout> | null;
  retentionExpiry: ReturnType<typeof setTimeout> | null;
  shutdownWaiters: Set<() => void>;
}

export interface AttachHandle {
  snapshot: DetachableExecutionSnapshot;
  detach: () => void;
}

export interface DetachableExecutionServiceOptions {
  now?: () => number;
  bufferLimitBytes?: number;
  exitedTtlMs?: number;
  maxRetainedExited?: number;
  spawnPty?: (
    file: string,
    args: readonly string[],
    options: pty.IPtyForkOptions,
  ) => IPty;
}

function defaultSpawnPty(
  file: string,
  args: readonly string[],
  options: pty.IPtyForkOptions,
): IPty {
  return pty.spawn(file, [...args], options);
}

function executionEnvironment(
  overrides: NodeJS.ProcessEnv | undefined,
): Record<string, string> {
  const merged: NodeJS.ProcessEnv = { ...process.env, ...overrides };
  const environment: Record<string, string> = {};

  for (const [key, value] of Object.entries(merged)) {
    if (value !== undefined) environment[key] = value;
  }

  environment.TERM = 'xterm-256color';
  return environment;
}

function utf8TailWithinByteLimit(value: string, limit: number): string {
  if (limit <= 0) return '';
  if (Buffer.byteLength(value, 'utf8') <= limit) return value;

  const codePoints = Array.from(value);
  let bytes = 0;
  let start = codePoints.length;
  for (let index = codePoints.length - 1; index >= 0; index -= 1) {
    const codePoint = codePoints[index]!;
    const codePointBytes = Buffer.byteLength(codePoint, 'utf8');
    if (bytes + codePointBytes > limit) break;
    bytes += codePointBytes;
    start = index;
  }
  return codePoints.slice(start).join('');
}

/**
 * Executa um comando fixo (já resolvido pelo chamador — nunca uma string
 * vinda do navegador) num PTY que continua rodando **independente de quem
 * está conectado**: desconectar (`detach`) não mata o processo, só para de
 * receber os eventos dele. Uma nova chamada a `attach` na mesma chave
 * reanexa ao processo em andamento (ou ao resultado final, se ainda estiver
 * retido), recebendo o buffer acumulado antes de voltar a receber dados ao
 * vivo. Execuções finalizadas têm retenção limitada por TTL + LRU para que
 * histórico transitório de PTY não cresça indefinidamente em memória.
 */
export class DetachableExecutionService {
  private readonly executions = new Map<string, ExecutionRecord>();
  private readonly now: () => number;
  private readonly bufferLimitBytes: number;
  private readonly exitedTtlMs: number;
  private readonly maxRetainedExited: number;
  private readonly spawnPty: (
    file: string,
    args: readonly string[],
    options: pty.IPtyForkOptions,
  ) => IPty;
  private closed = false;
  private closePromise: Promise<void> | null = null;

  public constructor(options: DetachableExecutionServiceOptions = {}) {
    this.now = options.now ?? Date.now;
    this.bufferLimitBytes =
      options.bufferLimitBytes ?? DEFAULT_BUFFER_LIMIT_BYTES;
    this.exitedTtlMs = Math.max(
      0,
      options.exitedTtlMs ?? DEFAULT_EXITED_TTL_MS,
    );
    this.maxRetainedExited = Math.max(
      0,
      Math.floor(options.maxRetainedExited ?? DEFAULT_MAX_RETAINED_EXITED),
    );
    this.spawnPty = options.spawnPty ?? defaultSpawnPty;
  }

  public isRunning(key: string): boolean {
    return this.executions.get(key)?.status === 'running';
  }

  public snapshotOf(key: string): DetachableExecutionSnapshot | undefined {
    this.pruneExited();
    const record = this.executions.get(key);
    if (!record) return undefined;
    this.touch(record);
    return this.toSnapshot(record);
  }

  public start(
    key: string,
    options: StartExecutionOptions,
  ): DetachableExecutionSnapshot {
    if (this.closed) {
      throw new Error('O serviço de execuções destacáveis já foi encerrado.');
    }

    this.pruneExited();
    const previous = this.executions.get(key);
    if (previous?.status === 'running') {
      throw new DetachableExecutionError(
        'ALREADY_RUNNING',
        'Já existe uma execução em andamento para esta chave.',
      );
    }
    if (previous) this.deleteRecord(key, previous);

    const proc = this.spawnPty(options.file, options.args, {
      name: 'xterm-256color',
      cols: options.cols ?? DEFAULT_COLS,
      rows: options.rows ?? DEFAULT_ROWS,
      cwd: options.cwd,
      env: executionEnvironment(options.env),
    });
    const startedAtMs = this.now();

    const record: ExecutionRecord = {
      proc,
      status: 'running',
      chunks: [],
      bufferedBytes: 0,
      truncated: false,
      exitCode: null,
      exitSignal: null,
      startedAt: new Date(startedAtMs).toISOString(),
      endedAt: null,
      endedAtMs: null,
      lastAccessedAtMs: startedAtMs,
      dataListeners: new Set(),
      exitListeners: new Set(),
      dataSubscription: null,
      exitSubscription: null,
      killEscalation: null,
      retentionExpiry: null,
      shutdownWaiters: new Set(),
    };
    this.executions.set(key, record);

    record.dataSubscription = proc.onData((data) => {
      const masked = maskSensitiveLogContent(data).content;
      this.appendToBuffer(record, masked);
      for (const listener of record.dataListeners) listener(masked);
    });

    record.exitSubscription = proc.onExit(({ exitCode, signal }) => {
      this.markExited(key, record, exitCode ?? null, signal ?? null);
    });

    return this.toSnapshot(record);
  }

  /**
   * Reanexa a uma execução existente (rodando ou terminada ainda retida):
   * entrega o buffer acumulado em `snapshot` e, quando estiver rodando,
   * passa a chamar `onData`/`onExit`. `detach()` só remove os listeners.
   */
  public attach(
    key: string,
    onData: (chunk: string) => void,
    onExit: (snapshot: DetachableExecutionSnapshot) => void,
  ): AttachHandle {
    this.pruneExited();
    const record = this.executions.get(key);
    if (!record) {
      throw new DetachableExecutionError(
        'NOT_FOUND',
        'Nenhuma execução encontrada para esta chave.',
      );
    }

    this.touch(record);
    if (record.status === 'running') {
      record.dataListeners.add(onData);
      record.exitListeners.add(onExit);
    }

    return {
      snapshot: this.toSnapshot(record),
      detach: () => {
        record.dataListeners.delete(onData);
        record.exitListeners.delete(onExit);
      },
    };
  }

  /** Encerra a execução de propósito (ex. o usuário cancelou) — TERM, depois KILL se não sair a tempo. */
  public cancel(key: string): void {
    const record = this.executions.get(key);
    if (!record || record.status !== 'running' || !record.proc) return;
    if (record.killEscalation) return;

    record.proc.kill('SIGTERM');
    record.killEscalation = setTimeout(() => {
      record.killEscalation = null;
      if (record.status === 'running') record.proc?.kill('SIGKILL');
    }, KILL_ESCALATION_MS);
    record.killEscalation.unref();
  }

  /** Libera a entrada de uma execução já terminada (nada a fazer se ainda estiver rodando). */
  public remove(key: string): void {
    this.pruneExited();
    const record = this.executions.get(key);
    if (!record || record.status === 'running') return;
    this.deleteRecord(key, record);
  }

  /**
   * Fecha o serviço inteiro durante o shutdown da API. O fechamento é
   * idempotente: remove listeners, dá uma janela curta de TERM aos PTYs ainda
   * ativos, escala para KILL quando necessário e libera toda retenção.
   */
  public close(): Promise<void> {
    if (this.closePromise) return this.closePromise;
    this.closed = true;
    this.closePromise = this.closeAll();
    return this.closePromise;
  }

  private async closeAll(): Promise<void> {
    const records = [...this.executions.values()];
    for (const record of records) {
      record.dataListeners.clear();
      record.exitListeners.clear();
    }

    await Promise.all(
      records
        .filter((record) => record.status === 'running')
        .map((record) => this.terminateForShutdown(record)),
    );

    for (const [key, record] of this.executions) {
      this.deleteRecord(key, record);
    }
  }

  private terminateForShutdown(record: ExecutionRecord): Promise<void> {
    if (record.status !== 'running' || !record.proc) return Promise.resolve();

    this.clearKillEscalation(record);

    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(escalation);
        record.shutdownWaiters.delete(finish);
        resolve();
      };
      const escalation = setTimeout(() => {
        if (record.status === 'running') record.proc?.kill('SIGKILL');
        finish();
      }, KILL_ESCALATION_MS);
      escalation.unref();

      record.shutdownWaiters.add(finish);
      record.proc?.kill('SIGTERM');
    });
  }

  private markExited(
    key: string,
    record: ExecutionRecord,
    exitCode: number | null,
    exitSignal: number | null,
  ): void {
    if (record.status !== 'running') return;

    const endedAtMs = this.now();
    record.status = 'exited';
    record.exitCode = exitCode;
    record.exitSignal = exitSignal;
    record.endedAtMs = endedAtMs;
    record.endedAt = new Date(endedAtMs).toISOString();
    record.lastAccessedAtMs = endedAtMs;
    this.clearKillEscalation(record);

    const snapshot = this.toSnapshot(record);
    for (const listener of record.exitListeners) listener(snapshot);
    record.dataListeners.clear();
    record.exitListeners.clear();

    for (const waiter of [...record.shutdownWaiters]) waiter();
    record.shutdownWaiters.clear();

    this.releasePty(record);
    this.scheduleExitedExpiry(key, record);
    this.pruneExited();
  }

  private scheduleExitedExpiry(key: string, record: ExecutionRecord): void {
    this.clearRetentionExpiry(record);
    if (this.exitedTtlMs <= 0) return;

    record.retentionExpiry = setTimeout(() => {
      record.retentionExpiry = null;
      if (this.executions.get(key) === record && record.status === 'exited') {
        this.deleteRecord(key, record);
      }
    }, this.exitedTtlMs);
    record.retentionExpiry.unref();
  }

  private appendToBuffer(record: ExecutionRecord, chunk: string): void {
    record.chunks.push(chunk);
    record.bufferedBytes += Buffer.byteLength(chunk, 'utf8');

    while (record.bufferedBytes > this.bufferLimitBytes) {
      const oldest = record.chunks[0];
      if (oldest === undefined) break;

      if (record.chunks.length === 1) {
        const trimmed = utf8TailWithinByteLimit(oldest, this.bufferLimitBytes);
        record.chunks[0] = trimmed;
        record.bufferedBytes = Buffer.byteLength(trimmed, 'utf8');
        record.truncated = true;
        break;
      }

      record.chunks.shift();
      record.bufferedBytes -= Buffer.byteLength(oldest, 'utf8');
      record.truncated = true;
    }
  }

  private touch(record: ExecutionRecord): void {
    record.lastAccessedAtMs = this.now();
  }

  private pruneExited(): void {
    const now = this.now();
    for (const [key, record] of this.executions) {
      if (
        record.status === 'exited' &&
        record.endedAtMs !== null &&
        now - record.endedAtMs >= this.exitedTtlMs
      ) {
        this.deleteRecord(key, record);
      }
    }

    const exited = [...this.executions.entries()]
      .filter(([, record]) => record.status === 'exited')
      .sort((left, right) => {
        const byAccess = left[1].lastAccessedAtMs - right[1].lastAccessedAtMs;
        if (byAccess !== 0) return byAccess;
        return (left[1].endedAtMs ?? 0) - (right[1].endedAtMs ?? 0);
      });

    const excess = exited.length - this.maxRetainedExited;
    for (let index = 0; index < excess; index += 1) {
      const entry = exited[index];
      if (!entry) break;
      this.deleteRecord(entry[0], entry[1]);
    }
  }

  private deleteRecord(key: string, record: ExecutionRecord): void {
    if (this.executions.get(key) !== record) return;
    this.clearKillEscalation(record);
    this.clearRetentionExpiry(record);
    record.dataListeners.clear();
    record.exitListeners.clear();
    for (const waiter of [...record.shutdownWaiters]) waiter();
    record.shutdownWaiters.clear();
    this.releasePty(record);
    this.executions.delete(key);
  }

  private clearKillEscalation(record: ExecutionRecord): void {
    if (!record.killEscalation) return;
    clearTimeout(record.killEscalation);
    record.killEscalation = null;
  }

  private clearRetentionExpiry(record: ExecutionRecord): void {
    if (!record.retentionExpiry) return;
    clearTimeout(record.retentionExpiry);
    record.retentionExpiry = null;
  }

  private releasePty(record: ExecutionRecord): void {
    record.dataSubscription?.dispose();
    record.exitSubscription?.dispose();
    record.dataSubscription = null;
    record.exitSubscription = null;
    record.proc = null;
  }

  private toSnapshot(record: ExecutionRecord): DetachableExecutionSnapshot {
    return {
      status: record.status,
      buffer: record.chunks.join(''),
      truncated: record.truncated,
      exitCode: record.exitCode,
      exitSignal: record.exitSignal,
      startedAt: record.startedAt,
      endedAt: record.endedAt,
    };
  }
}
