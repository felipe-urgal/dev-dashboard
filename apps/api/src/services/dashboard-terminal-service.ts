import { randomBytes } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import * as pty from 'node-pty';
import type { IPty } from 'node-pty';
import type { RawData, WebSocket } from 'ws';

const MAX_MESSAGE_BYTES = 65_536;
const MAX_PENDING_OUTPUT_BYTES = 262_144;
const MAX_SESSIONS = 4;
const MIN_DIMENSION = 1;
const MAX_COLS = 500;
const MAX_ROWS = 200;
const DEFAULT_COLS = 100;
const DEFAULT_ROWS = 30;
const CONFIRMATION_TTL_MS = 60_000;
const DEFAULT_RECONNECT_GRACE_MS = 8_000;
const USER_CLOSE_REASON = 'Sessão encerrada pelo usuário';

interface ConfirmationRecord {
  expiresAt: number;
}

interface DashboardTerminalSession {
  id: string;
  reconnectToken: string;
  proc: IPty;
  socket?: WebSocket;
  reconnectTimer?: ReturnType<typeof setTimeout>;
  pendingOutput: string;
}

export interface DashboardTerminalConfirmation {
  token: string;
  expiresAt: string;
}

export interface DashboardTerminalServiceOptions {
  now?: () => number;
  dashboardRoot?: string;
  reconnectGraceMs?: number;
  spawnPty?: (
    file: string,
    args: readonly string[],
    options: pty.IPtyForkOptions,
  ) => IPty;
}

function defaultDashboardRoot(): string {
  const configured = process.env.DEV_DASHBOARD_DIR?.trim();
  if (configured) return configured;

  return path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../../..',
  );
}

function defaultSpawnPty(
  file: string,
  args: readonly string[],
  options: pty.IPtyForkOptions,
): IPty {
  return pty.spawn(file, [...args], options);
}

function sendJson(socket: WebSocket, message: unknown): void {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function boundedTail(value: string, maximumBytes: number): string {
  if (maximumBytes <= 0) return '';
  if (Buffer.byteLength(value, 'utf8') <= maximumBytes) return value;

  const codePoints = Array.from(value);
  let bytes = 0;
  let start = codePoints.length;
  for (let index = codePoints.length - 1; index >= 0; index -= 1) {
    const current = codePoints[index]!;
    const currentBytes = Buffer.byteLength(current, 'utf8');
    if (bytes + currentBytes > maximumBytes) break;
    bytes += currentBytes;
    start = index;
  }
  return codePoints.slice(start).join('');
}

function closeReason(reason: Buffer | string | undefined): string {
  return Buffer.isBuffer(reason) ? reason.toString('utf8') : (reason ?? '');
}

export class DashboardTerminalService {
  private readonly confirmations = new Map<string, ConfirmationRecord>();
  private readonly sessions = new Map<string, DashboardTerminalSession>();
  private readonly now: () => number;
  private readonly dashboardRoot: string;
  private readonly spawnPty: DashboardTerminalServiceOptions['spawnPty'];
  private readonly reconnectGraceMs: number;

  public constructor(options: DashboardTerminalServiceOptions = {}) {
    this.now = options.now ?? Date.now;
    this.dashboardRoot = options.dashboardRoot ?? defaultDashboardRoot();
    this.spawnPty = options.spawnPty ?? defaultSpawnPty;
    this.reconnectGraceMs = Math.max(
      0,
      options.reconnectGraceMs ?? DEFAULT_RECONNECT_GRACE_MS,
    );
  }

  public prepareConfirmation(): DashboardTerminalConfirmation {
    this.sweepConfirmations();
    const token = randomBytes(32).toString('hex');
    const expiresAt = this.now() + CONFIRMATION_TTL_MS;
    this.confirmations.set(token, { expiresAt });
    return {
      token,
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  public async attach(
    confirmationToken: string | undefined,
    socket: WebSocket,
    reconnect?: { sessionId?: string; reconnectToken?: string },
  ): Promise<void> {
    if (reconnect?.sessionId || reconnect?.reconnectToken) {
      this.attachExisting(
        socket,
        reconnect.sessionId,
        reconnect.reconnectToken,
      );
      return;
    }

    this.sweepConfirmations();
    const record = confirmationToken
      ? this.confirmations.get(confirmationToken)
      : undefined;
    if (!record) {
      sendJson(socket, {
        type: 'error',
        message: 'Confirmação ausente, inválida ou expirada.',
      });
      socket.close(1008, 'Confirmação inválida');
      return;
    }
    this.confirmations.delete(confirmationToken!);

    if (this.sessions.size >= MAX_SESSIONS) {
      sendJson(socket, {
        type: 'error',
        message:
          'Limite de sessões do modo terminal atingido. Feche outra sessão e tente novamente.',
      });
      socket.close(1013, 'Limite de sessões atingido');
      return;
    }

    const initScript = path.join(this.dashboardRoot, 'init.sh');
    try {
      await access(initScript, fsConstants.R_OK);
    } catch {
      sendJson(socket, {
        type: 'error',
        message: 'Não foi possível localizar o init.sh do Dev Dashboard.',
      });
      socket.close(1011, 'Dev Dashboard indisponível');
      return;
    }

    let child: IPty;
    try {
      child = this.spawnPty!(
        '/bin/bash',
        [
          '--noprofile',
          '--norc',
          '-c',
          'unset DEV_LOADED; export DEV_SILENT=1; source "$1/init.sh" && dev-tools',
          'dev-dashboard',
          this.dashboardRoot,
        ],
        {
          name: 'xterm-256color',
          cols: DEFAULT_COLS,
          rows: DEFAULT_ROWS,
          cwd: this.dashboardRoot,
          env: {
            ...process.env,
            DEV_SILENT: '1',
            TERM: 'xterm-256color',
          },
        },
      );
    } catch {
      sendJson(socket, {
        type: 'error',
        message: 'Não foi possível iniciar o modo terminal do Dev Dashboard.',
      });
      socket.close(1011, 'Falha ao iniciar');
      return;
    }

    const id = randomBytes(16).toString('hex');
    const session: DashboardTerminalSession = {
      id,
      reconnectToken: randomBytes(32).toString('hex'),
      proc: child,
      socket,
      pendingOutput: '',
    };
    this.sessions.set(id, session);

    child.onData((data) => {
      const currentSocket = session.socket;
      if (currentSocket?.readyState === currentSocket.OPEN) {
        sendJson(currentSocket, { type: 'output', data });
        return;
      }
      session.pendingOutput = boundedTail(
        session.pendingOutput + data,
        MAX_PENDING_OUTPUT_BYTES,
      );
    });
    child.onExit(({ exitCode }) => {
      this.clearReconnectTimer(session);
      const currentSocket = session.socket;
      if (currentSocket) {
        sendJson(currentSocket, { type: 'exit', code: exitCode ?? null });
      }
      this.sessions.delete(id);
      if (currentSocket?.readyState === currentSocket.OPEN) {
        currentSocket.close(1000, 'Modo terminal encerrado');
      }
    });

    this.bindSocket(session, socket);
    this.sendReady(session, socket, false);
  }

  public close(): void {
    for (const session of this.sessions.values()) {
      this.clearReconnectTimer(session);
      session.socket?.close(1001, 'API encerrando');
      session.proc.kill();
    }
    this.sessions.clear();
    this.confirmations.clear();
  }

  private attachExisting(
    socket: WebSocket,
    sessionId: string | undefined,
    reconnectToken: string | undefined,
  ): void {
    const session = sessionId ? this.sessions.get(sessionId) : undefined;
    if (
      !session ||
      !reconnectToken ||
      reconnectToken !== session.reconnectToken
    ) {
      sendJson(socket, {
        type: 'error',
        message:
          'A sessão anterior não está mais disponível. Abra uma nova sessão.',
      });
      socket.close(1008, 'Reconexão inválida');
      return;
    }

    if (
      session.socket &&
      session.socket.readyState === session.socket.OPEN &&
      session.socket !== socket
    ) {
      sendJson(socket, {
        type: 'error',
        message: 'A sessão já está conectada em outro cliente.',
      });
      socket.close(1008, 'Sessão já conectada');
      return;
    }

    this.clearReconnectTimer(session);
    session.socket = socket;
    this.bindSocket(session, socket);
    this.sendReady(session, socket, true);

    if (session.pendingOutput) {
      sendJson(socket, { type: 'output', data: session.pendingOutput });
      session.pendingOutput = '';
    }
  }

  private sendReady(
    session: DashboardTerminalSession,
    socket: WebSocket,
    reconnected: boolean,
  ): void {
    sendJson(socket, {
      type: 'ready',
      sessionId: session.id,
      reconnectToken: session.reconnectToken,
      reconnected,
      reconnectGraceMs: this.reconnectGraceMs,
    });
  }

  private bindSocket(
    session: DashboardTerminalSession,
    socket: WebSocket,
  ): void {
    socket.on('message', (data: RawData, isBinary: boolean) =>
      this.handleClientMessage(session, socket, data, isBinary),
    );
    socket.once('close', (code: number, reason: Buffer) =>
      this.handleSocketGone(session, socket, code, closeReason(reason)),
    );
    socket.once('error', () =>
      this.handleSocketGone(session, socket, 1006, 'Erro de conexão'),
    );
  }

  private handleClientMessage(
    session: DashboardTerminalSession,
    socket: WebSocket,
    data: RawData,
    isBinary: boolean,
  ): void {
    if (session.socket !== socket) return;
    if (isBinary) {
      socket.close(1003, 'Mensagens binárias não são suportadas');
      return;
    }

    const buffer = Buffer.isBuffer(data)
      ? data
      : Buffer.from(data as ArrayBuffer);
    if (buffer.length > MAX_MESSAGE_BYTES) {
      socket.close(1009, 'Mensagem muito grande');
      return;
    }

    let message: unknown;
    try {
      message = JSON.parse(buffer.toString('utf8')) as unknown;
    } catch {
      socket.close(1007, 'Mensagem JSON inválida');
      return;
    }
    if (!message || typeof message !== 'object') {
      socket.close(1007, 'Mensagem inválida');
      return;
    }

    const record = message as Record<string, unknown>;
    if (record.type === 'input' && typeof record.data === 'string') {
      session.proc.write(record.data);
      return;
    }

    if (
      record.type === 'resize' &&
      typeof record.cols === 'number' &&
      Number.isFinite(record.cols) &&
      typeof record.rows === 'number' &&
      Number.isFinite(record.rows)
    ) {
      const cols = Math.min(
        MAX_COLS,
        Math.max(MIN_DIMENSION, Math.floor(record.cols)),
      );
      const rows = Math.min(
        MAX_ROWS,
        Math.max(MIN_DIMENSION, Math.floor(record.rows)),
      );
      try {
        session.proc.resize(cols, rows);
      } catch {
        // O processo pode ter encerrado entre a mensagem e o resize.
      }
      return;
    }

    socket.close(1007, 'Mensagem não suportada');
  }

  private handleSocketGone(
    session: DashboardTerminalSession,
    socket: WebSocket,
    code: number,
    reason: string,
  ): void {
    if (session.socket !== socket || !this.sessions.has(session.id)) return;
    session.socket = undefined;

    if (
      (code === 1000 && reason === USER_CLOSE_REASON) ||
      code === 1003 ||
      code === 1007 ||
      code === 1009
    ) {
      this.teardown(session.id);
      return;
    }

    this.clearReconnectTimer(session);
    session.reconnectTimer = setTimeout(
      () => this.teardown(session.id),
      this.reconnectGraceMs,
    );
    session.reconnectTimer.unref?.();
  }

  private teardown(id: string): void {
    const session = this.sessions.get(id);
    if (!session) return;
    this.clearReconnectTimer(session);
    this.sessions.delete(id);
    session.socket = undefined;
    session.proc.kill();
  }

  private clearReconnectTimer(session: DashboardTerminalSession): void {
    if (!session.reconnectTimer) return;
    clearTimeout(session.reconnectTimer);
    session.reconnectTimer = undefined;
  }

  private sweepConfirmations(): void {
    const now = this.now();
    for (const [token, record] of this.confirmations) {
      if (record.expiresAt <= now) {
        this.confirmations.delete(token);
      }
    }
  }
}
