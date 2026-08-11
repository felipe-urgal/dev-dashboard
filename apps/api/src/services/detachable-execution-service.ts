import * as pty from 'node-pty';
import type { IPty } from 'node-pty';

const DEFAULT_BUFFER_LIMIT_BYTES = 262_144; // mesmo teto já usado em toda leitura de log do dashboard
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

interface ExecutionRecord {
  proc: IPty;
  status: DetachableExecutionStatus;
  chunks: string[];
  bufferedBytes: number;
  truncated: boolean;
  exitCode: number | null;
  exitSignal: number | null;
  startedAt: string;
  endedAt: string | null;
  dataListeners: Set<(chunk: string) => void>;
  exitListeners: Set<(snapshot: DetachableExecutionSnapshot) => void>;
}

export interface AttachHandle {
  snapshot: DetachableExecutionSnapshot;
  detach: () => void;
}

export interface DetachableExecutionServiceOptions {
  now?: () => number;
  bufferLimitBytes?: number;
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

/**
 * Executa um comando fixo (já resolvido pelo chamador — nunca uma string
 * vinda do navegador) num PTY que continua rodando **independente de quem
 * está conectado**: desconectar (`detach`) não mata o processo, só para de
 * receber os eventos dele. Uma nova chamada a `attach` na mesma chave
 * reanexa ao processo em andamento (ou ao resultado final, se já tiver
 * terminado), recebendo o buffer acumulado antes de voltar a receber dados
 * ao vivo. É o oposto deliberado de `ProjectTerminalService`, que mata a
 * sessão de shell ao desconectar — aqui a chave é "posso fechar a aba e
 * voltar depois", não "é um shell de acesso total que não deve ficar
 * esquecido rodando".
 */
export class DetachableExecutionService {
  private readonly executions = new Map<string, ExecutionRecord>();
  private readonly now: () => number;
  private readonly bufferLimitBytes: number;
  private readonly spawnPty: (
    file: string,
    args: readonly string[],
    options: pty.IPtyForkOptions,
  ) => IPty;

  public constructor(options: DetachableExecutionServiceOptions = {}) {
    this.now = options.now ?? Date.now;
    this.bufferLimitBytes =
      options.bufferLimitBytes ?? DEFAULT_BUFFER_LIMIT_BYTES;
    this.spawnPty = options.spawnPty ?? defaultSpawnPty;
  }

  public isRunning(key: string): boolean {
    return this.executions.get(key)?.status === 'running';
  }

  public snapshotOf(key: string): DetachableExecutionSnapshot | undefined {
    const record = this.executions.get(key);
    return record ? this.toSnapshot(record) : undefined;
  }

  public start(
    key: string,
    options: StartExecutionOptions,
  ): DetachableExecutionSnapshot {
    if (this.isRunning(key)) {
      throw new DetachableExecutionError(
        'ALREADY_RUNNING',
        'Já existe uma execução em andamento para esta chave.',
      );
    }

    const proc = this.spawnPty(options.file, options.args, {
      name: 'xterm-256color',
      cols: options.cols ?? DEFAULT_COLS,
      rows: options.rows ?? DEFAULT_ROWS,
      cwd: options.cwd,
      env: { ...process.env, ...options.env, TERM: 'xterm-256color' },
    });

    const record: ExecutionRecord = {
      proc,
      status: 'running',
      chunks: [],
      bufferedBytes: 0,
      truncated: false,
      exitCode: null,
      exitSignal: null,
      startedAt: new Date(this.now()).toISOString(),
      endedAt: null,
      dataListeners: new Set(),
      exitListeners: new Set(),
    };
    this.executions.set(key, record);

    proc.onData((data) => {
      this.appendToBuffer(record, data);
      for (const listener of record.dataListeners) listener(data);
    });

    proc.onExit(({ exitCode, signal }) => {
      record.status = 'exited';
      record.exitCode = exitCode ?? null;
      record.exitSignal = signal ?? null;
      record.endedAt = new Date(this.now()).toISOString();
      const snapshot = this.toSnapshot(record);
      for (const listener of record.exitListeners) listener(snapshot);
    });

    return this.toSnapshot(record);
  }

  /**
   * Reanexa a uma execução existente (rodando ou já terminada): entrega o
   * buffer acumulado em `snapshot` e, a partir daí, chama `onData`/`onExit`
   * para o que vier depois. `detach()` só remove os listeners — nunca mata
   * o processo.
   */
  public attach(
    key: string,
    onData: (chunk: string) => void,
    onExit: (snapshot: DetachableExecutionSnapshot) => void,
  ): AttachHandle {
    const record = this.executions.get(key);
    if (!record) {
      throw new DetachableExecutionError(
        'NOT_FOUND',
        'Nenhuma execução encontrada para esta chave.',
      );
    }

    record.dataListeners.add(onData);
    record.exitListeners.add(onExit);

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
    if (!record || record.status !== 'running') return;

    record.proc.kill('SIGTERM');
    const escalation = setTimeout(() => {
      if (record.status === 'running') record.proc.kill('SIGKILL');
    }, KILL_ESCALATION_MS);
    escalation.unref();
  }

  /** Libera a entrada de uma execução já terminada (nada a fazer se ainda estiver rodando). */
  public remove(key: string): void {
    const record = this.executions.get(key);
    if (!record || record.status === 'running') return;
    this.executions.delete(key);
  }

  private appendToBuffer(record: ExecutionRecord, chunk: string): void {
    record.chunks.push(chunk);
    record.bufferedBytes += Buffer.byteLength(chunk, 'utf8');

    while (record.bufferedBytes > this.bufferLimitBytes) {
      const oldest = record.chunks[0];
      if (oldest === undefined) break;

      if (record.chunks.length === 1) {
        const overBy = record.bufferedBytes - this.bufferLimitBytes;
        const trimmed = Buffer.from(oldest, 'utf8')
          .subarray(overBy)
          .toString('utf8');
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
