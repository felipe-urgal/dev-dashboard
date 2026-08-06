import { randomBytes } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { access, realpath } from 'node:fs/promises';
import path from 'node:path';

import * as pty from 'node-pty';
import type { IPty } from 'node-pty';

import type {
  Project,
  ProjectTerminalConfirmation,
  ProjectTerminalKind,
  ProjectTerminalStatus,
} from '@dev-dashboard/contracts';
import type { RawData, WebSocket } from 'ws';

const MAX_MESSAGE_BYTES = 65_536;
const MAX_TOTAL_SESSIONS = 16;
const MAX_SESSIONS_PER_KEY = 4;
const MIN_DIMENSION = 1;
const MAX_COLS = 500;
const MAX_ROWS = 200;
const CONFIRMATION_TTL_MS = 60_000;
const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;

export interface ResolvedTerminalCommand {
  file: string;
  args: readonly string[];
}

interface TerminalSession {
  id: number;
  project: Project;
  kind: ProjectTerminalKind;
  proc: IPty;
  socket: WebSocket;
}

interface ConfirmationRecord {
  token: string;
  projectId: string;
  kind: ProjectTerminalKind;
  expiresAt: number;
}

export interface ProjectTerminalServiceOptions {
  now?: () => number;
  spawnPty?: (
    file: string,
    args: readonly string[],
    options: pty.IPtyForkOptions,
  ) => IPty;
  resolveCommand?: (
    project: Project,
    root: string,
    kind: ProjectTerminalKind,
  ) => Promise<ResolvedTerminalCommand | undefined>;
}

export class ProjectTerminalError extends Error {}

function sessionKey(projectId: string, kind: ProjectTerminalKind): string {
  return `${projectId}:${kind}`;
}

function sendJson(socket: WebSocket, message: unknown): void {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

async function executableCandidate(
  candidate: string,
): Promise<string | undefined> {
  try {
    await access(candidate, fsConstants.X_OK);
    return candidate;
  } catch {
    return undefined;
  }
}

async function findExecutableOnPath(name: string): Promise<string | undefined> {
  const directories = (process.env.PATH ?? '')
    .split(path.delimiter)
    .filter(Boolean);
  for (const directory of directories) {
    const found = await executableCandidate(path.join(directory, name));
    if (found) return found;
  }
  return undefined;
}

function defaultSpawnPty(
  file: string,
  args: readonly string[],
  options: pty.IPtyForkOptions,
): IPty {
  return pty.spawn(file, [...args], options);
}

/**
 * Resolve sem instalar nada: prefere o binstub do projeto (já aponta para o
 * bundle correto) e cai para `bundle exec rails console` só quando o binstub
 * não existe. Nunca dispara `bundle install`.
 */
async function defaultResolveCommand(
  _project: Project,
  root: string,
  kind: ProjectTerminalKind,
): Promise<ResolvedTerminalCommand | undefined> {
  if (kind === 'shell') {
    const shell = process.env.SHELL ?? '/bin/bash';
    return { file: shell, args: [] };
  }

  const binRails = await executableCandidate(path.join(root, 'bin', 'rails'));
  if (binRails) {
    return { file: binRails, args: ['console'] };
  }
  const bundle = await findExecutableOnPath('bundle');
  if (bundle) {
    return { file: bundle, args: ['exec', 'rails', 'console'] };
  }
  return undefined;
}

export class ProjectTerminalService {
  private readonly sessions = new Map<string, TerminalSession>();
  private readonly confirmations = new Map<string, ConfirmationRecord>();
  private readonly now: () => number;
  private readonly spawnPty: (
    file: string,
    args: readonly string[],
    options: pty.IPtyForkOptions,
  ) => IPty;
  private readonly resolveCommand: (
    project: Project,
    root: string,
    kind: ProjectTerminalKind,
  ) => Promise<ResolvedTerminalCommand | undefined>;
  private nextSessionId = 1;

  public constructor(options: ProjectTerminalServiceOptions = {}) {
    this.now = options.now ?? Date.now;
    this.spawnPty = options.spawnPty ?? defaultSpawnPty;
    this.resolveCommand = options.resolveCommand ?? defaultResolveCommand;
  }

  public supports(project: Project, kind: ProjectTerminalKind): boolean {
    return kind === 'shell' ? true : project.type === 'rails';
  }

  public status(
    project: Project,
    kind: ProjectTerminalKind,
  ): ProjectTerminalStatus {
    const supported = this.supports(project, kind);
    const activeSessions = this.countActive(project.id, kind);
    return {
      kind,
      supported,
      activeSessions,
      message: !supported
        ? 'Este projeto não é reconhecido como Rails, então o console não está disponível.'
        : kind === 'shell'
          ? 'Terminal disponível. Abre um shell interativo na raiz do projeto.'
          : 'Console Rails disponível. Abre `bin/rails console` (ou `bundle exec rails console`) na raiz do projeto.',
    };
  }

  public prepareConfirmation(
    project: Project,
    kind: ProjectTerminalKind,
  ): ProjectTerminalConfirmation {
    this.sweepConfirmations();
    const token = randomBytes(32).toString('hex');
    const expiresAt = this.now() + CONFIRMATION_TTL_MS;
    this.confirmations.set(token, {
      token,
      projectId: project.id,
      kind,
      expiresAt,
    });
    return { token, expiresAt: new Date(expiresAt).toISOString() };
  }

  public async attach(
    project: Project,
    kind: ProjectTerminalKind,
    confirmationToken: string | undefined,
    socket: WebSocket,
  ): Promise<void> {
    this.sweepConfirmations();
    const record = confirmationToken
      ? this.confirmations.get(confirmationToken)
      : undefined;
    if (!record || record.projectId !== project.id || record.kind !== kind) {
      sendJson(socket, {
        type: 'error',
        message: 'Confirmação ausente, inválida ou expirada.',
      });
      socket.close(1008, 'Confirmação inválida');
      return;
    }
    this.confirmations.delete(confirmationToken!);

    if (!this.supports(project, kind)) {
      sendJson(socket, {
        type: 'error',
        message: this.status(project, kind).message,
      });
      socket.close(1000, 'Indisponível para este projeto');
      return;
    }

    if (
      this.sessions.size >= MAX_TOTAL_SESSIONS ||
      this.countActive(project.id, kind) >= MAX_SESSIONS_PER_KEY
    ) {
      sendJson(socket, {
        type: 'error',
        message:
          'Limite de sessões de terminal atingido. Feche outra sessão e tente novamente.',
      });
      socket.close(1013, 'Limite de sessões atingido');
      return;
    }

    const root = await realpath(project.path).catch(() => project.path);
    const command = await this.resolveCommand(project, root, kind);
    if (!command) {
      sendJson(socket, {
        type: 'error',
        message:
          kind === 'shell'
            ? 'Não foi possível localizar um shell para iniciar a sessão.'
            : 'Não foi possível localizar `bin/rails` nem `bundle` para iniciar o console.',
      });
      socket.close(1011, 'Comando indisponível');
      return;
    }

    let child: IPty;
    try {
      child = this.spawnPty(command.file, command.args, {
        name: 'xterm-256color',
        cols: DEFAULT_COLS,
        rows: DEFAULT_ROWS,
        cwd: root,
        env: { ...process.env, TERM: 'xterm-256color' },
      });
    } catch {
      sendJson(socket, {
        type: 'error',
        message: 'Não foi possível iniciar a sessão de terminal.',
      });
      socket.close(1011, 'Falha ao iniciar');
      return;
    }

    const id = this.nextSessionId++;
    const key = sessionKey(project.id, kind);
    const session: TerminalSession = { id, project, kind, proc: child, socket };
    this.sessions.set(`${key}:${id}`, session);

    child.onData((data) => sendJson(socket, { type: 'output', data }));
    child.onExit(({ exitCode }) => {
      sendJson(socket, { type: 'exit', code: exitCode ?? null });
      this.sessions.delete(`${key}:${id}`);
      if (socket.readyState === socket.OPEN)
        socket.close(1000, 'Processo encerrado');
    });

    sendJson(socket, { type: 'ready' });

    socket.on('message', (data: RawData) =>
      this.handleClientMessage(session, data),
    );
    socket.once('close', () => this.teardown(key, id));
    socket.once('error', () => this.teardown(key, id));
  }

  public close(): void {
    for (const session of this.sessions.values()) {
      session.socket.close(1001, 'API encerrando');
      session.proc.kill();
    }
    this.sessions.clear();
    this.confirmations.clear();
  }

  private countActive(projectId: string, kind: ProjectTerminalKind): number {
    const key = sessionKey(projectId, kind);
    let count = 0;
    for (const existingKey of this.sessions.keys()) {
      if (existingKey.startsWith(`${key}:`)) count += 1;
    }
    return count;
  }

  private handleClientMessage(session: TerminalSession, data: RawData): void {
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
        // A sessão pode já ter encerrado entre a mensagem e o resize.
      }
    }
  }

  private teardown(key: string, id: number): void {
    const fullKey = `${key}:${id}`;
    const session = this.sessions.get(fullKey);
    if (!session) return;
    this.sessions.delete(fullKey);
    session.proc.kill();
  }

  private sweepConfirmations(): void {
    const now = this.now();
    for (const [token, record] of this.confirmations) {
      if (record.expiresAt <= now) this.confirmations.delete(token);
    }
  }
}
