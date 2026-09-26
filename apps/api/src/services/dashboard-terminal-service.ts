import { randomBytes } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import * as pty from 'node-pty';
import type { IPty } from 'node-pty';
import type { RawData, WebSocket } from 'ws';

const MAX_MESSAGE_BYTES = 65_536;
const MAX_SESSIONS = 4;
const MIN_DIMENSION = 1;
const MAX_COLS = 500;
const MAX_ROWS = 200;
const DEFAULT_COLS = 100;
const DEFAULT_ROWS = 30;
const CONFIRMATION_TTL_MS = 60_000;

interface ConfirmationRecord {
  expiresAt: number;
}

interface DashboardTerminalSession {
  id: number;
  proc: IPty;
  socket: WebSocket;
}

export interface DashboardTerminalConfirmation {
  token: string;
  expiresAt: string;
}

export interface DashboardTerminalServiceOptions {
  now?: () => number;
  dashboardRoot?: string;
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

export class DashboardTerminalService {
  private readonly confirmations = new Map<string, ConfirmationRecord>();
  private readonly sessions = new Map<number, DashboardTerminalSession>();
  private readonly now: () => number;
  private readonly dashboardRoot: string;
  private readonly spawnPty: DashboardTerminalServiceOptions['spawnPty'];
  private nextSessionId = 1;

  public constructor(options: DashboardTerminalServiceOptions = {}) {
    this.now = options.now ?? Date.now;
    this.dashboardRoot = options.dashboardRoot ?? defaultDashboardRoot();
    this.spawnPty = options.spawnPty ?? defaultSpawnPty;
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
  ): Promise<void> {
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
      child = this.spawnPty!('/bin/bash', [
        '--noprofile',
        '--norc',
        '-c',
        'unset DEV_LOADED; export DEV_SILENT=1; source "$1/init.sh" && dev-tools',
        'dev-dashboard',
        this.dashboardRoot,
      ], {
        name: 'xterm-256color',
        cols: DEFAULT_COLS,
        rows: DEFAULT_ROWS,
        cwd: this.dashboardRoot,
        env: {
          ...process.env,
          DEV_SILENT: '1',
          TERM: 'xterm-256color',
        },
      });
    } catch {
      sendJson(socket, {
        type: 'error',
        message: 'Não foi possível iniciar o modo terminal do Dev Dashboard.',
      });
      socket.close(1011, 'Falha ao iniciar');
      return;
    }

    const id = this.nextSessionId++;
    const session: DashboardTerminalSession = { id, proc: child, socket };
    this.sessions.set(id, session);

    child.onData((data) => sendJson(socket, { type: 'output', data }));
    child.onExit(({ exitCode }) => {
      sendJson(socket, { type: 'exit', code: exitCode ?? null });
      this.sessions.delete(id);
      if (socket.readyState === socket.OPEN) {
        socket.close(1000, 'Modo terminal encerrado');
      }
    });

    sendJson(socket, { type: 'ready' });

    socket.on('message', (data: RawData) =>
      this.handleClientMessage(session, data),
    );
    socket.once('close', () => this.teardown(id));
    socket.once('error', () => this.teardown(id));
  }

  public close(): void {
    for (const session of this.sessions.values()) {
      session.socket.close(1001, 'API encerrando');
      session.proc.kill();
    }
    this.sessions.clear();
    this.confirmations.clear();
  }

  private handleClientMessage(
    session: DashboardTerminalSession,
    data: RawData,
  ): void {
    const buffer = Buffer.isBuffer(data)
      ? data
      : Buffer.from(data as ArrayBuffer);
    if (buffer.length > MAX_MESSAGE_BYTES) {
      session.socket.close(1009, 'Mensagem muito grande');
      return;
    }

    let message: unknown;
    try {
      message = JSON.parse(buffer.toString('utf8')) as unknown;
    } catch {
      return;
    }
    if (!message || typeof message !== 'object') return;

    const record = message as Record<string, unknown>;
    if (record.type === 'input' && typeof record.data === 'string') {
      session.proc.write(record.data);
      return;
    }

    if (
      record.type === 'resize' &&
      typeof record.cols === 'number' &&
      typeof record.rows === 'number'
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
    }
  }

  private teardown(id: number): void {
    const session = this.sessions.get(id);
    if (!session) return;
    this.sessions.delete(id);
    session.proc.kill();
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
