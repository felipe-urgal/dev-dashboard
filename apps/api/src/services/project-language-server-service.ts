import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import { access, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import type {
  Project,
  ProjectLanguageServerStatus,
} from '@dev-dashboard/contracts';
import type { RawData, WebSocket } from 'ws';

const MAX_MESSAGE_BYTES = 1024 * 1024;
const IDLE_TIMEOUT_MS = 60_000;
const FORCE_KILL_DELAY_MS = 2_000;
const RESTART_WINDOW_MS = 60_000;
const MAX_STARTS_PER_WINDOW = 3;
const LSP_EXECUTABLE = 'typescript-language-server';
const LSP_ARGUMENTS = ['--stdio'] as const;
const OMIT = Symbol('omit');

interface LanguageServerSession {
  project: Project;
  root: string;
  executable: string;
  process: ChildProcessWithoutNullStreams;
  decoder: LspMessageDecoder;
  socket: WebSocket | undefined;
  state: 'starting' | 'ready' | 'failed';
  lastStartedAt: string;
  idleTimer: NodeJS.Timeout | undefined;
  forceKillTimer: NodeJS.Timeout | undefined;
}

export interface ProjectLanguageServerServiceOptions {
  idleTimeoutMs?: number;
  now?: () => number;
  findExecutable?: (projectRoot: string) => Promise<string | undefined>;
  spawnProcess?: (
    executable: string,
    args: readonly string[],
    cwd: string,
  ) => ChildProcessWithoutNullStreams;
}

export class LanguageServerProtocolError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'LanguageServerProtocolError';
  }
}

export class LspMessageDecoder {
  private buffer = Buffer.alloc(0);

  public push(chunk: Buffer): unknown[] {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const messages: unknown[] = [];

    while (this.buffer.length > 0) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n');
      if (headerEnd < 0) break;

      const header = this.buffer.subarray(0, headerEnd).toString('ascii');
      const lengthMatch = header.match(/(?:^|\r\n)Content-Length:\s*(\d+)/i);
      if (!lengthMatch) {
        throw new LanguageServerProtocolError(
          'O servidor de linguagem enviou um frame sem Content-Length.',
        );
      }

      const contentLength = Number(lengthMatch[1]);
      if (!Number.isSafeInteger(contentLength) || contentLength < 0) {
        throw new LanguageServerProtocolError(
          'O servidor de linguagem enviou um tamanho inválido.',
        );
      }
      if (contentLength > MAX_MESSAGE_BYTES) {
        throw new LanguageServerProtocolError(
          'O servidor de linguagem ultrapassou o limite de 1 MB por mensagem.',
        );
      }

      const bodyStart = headerEnd + 4;
      const bodyEnd = bodyStart + contentLength;
      if (this.buffer.length < bodyEnd) break;

      const body = this.buffer.subarray(bodyStart, bodyEnd).toString('utf8');
      this.buffer = this.buffer.subarray(bodyEnd);
      try {
        messages.push(JSON.parse(body) as unknown);
      } catch {
        throw new LanguageServerProtocolError(
          'O servidor de linguagem enviou JSON inválido.',
        );
      }
    }

    return messages;
  }
}

export function encodeLspMessage(message: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(message), 'utf8');
  if (body.length > MAX_MESSAGE_BYTES) {
    throw new LanguageServerProtocolError(
      'A mensagem ultrapassa o limite de 1 MB.',
    );
  }
  return Buffer.concat([
    Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'ascii'),
    body,
  ]);
}

function isWithinRoot(root: string, target: string): boolean {
  return target === root || target.startsWith(`${root}${path.sep}`);
}

function syntheticRootUri(projectId: string): string {
  return `file:///dev-dashboard/projects/${encodeURIComponent(projectId)}`;
}

function syntheticUri(projectId: string, relativePath: string): string {
  const encoded = relativePath
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return encoded
    ? `${syntheticRootUri(projectId)}/${encoded}`
    : syntheticRootUri(projectId);
}

function relativePathFromSyntheticUri(projectId: string, uri: string): string {
  const rootUri = syntheticRootUri(projectId);
  if (uri === rootUri || uri === `${rootUri}/`) return '';
  if (!uri.startsWith(`${rootUri}/`)) {
    throw new LanguageServerProtocolError(
      'O servidor de linguagem recebeu uma URI fora do projeto autorizado.',
    );
  }

  const encodedPath = uri.slice(rootUri.length + 1);
  const segments = encodedPath.split('/').map((segment) => {
    const decoded = decodeURIComponent(segment);
    if (
      !decoded
      || decoded === '.'
      || decoded === '..'
      || decoded.includes('/')
      || decoded.includes('\\')
      || decoded.includes('\0')
    ) {
      throw new LanguageServerProtocolError(
        'A URI do documento contém um caminho inválido.',
      );
    }
    return decoded;
  });
  return segments.join('/');
}

export function clientUriToServerUri(
  projectId: string,
  projectRoot: string,
  uri: string,
): string {
  if (!uri.startsWith('file:')) return uri;
  const relativePath = relativePathFromSyntheticUri(projectId, uri);
  const target = path.resolve(
    projectRoot,
    ...relativePath.split('/').filter(Boolean),
  );
  if (!isWithinRoot(projectRoot, target)) {
    throw new LanguageServerProtocolError(
      'A URI do documento escapa da raiz do projeto.',
    );
  }
  return pathToFileURL(target).href;
}

export function serverUriToClientUri(
  projectId: string,
  projectRoot: string,
  uri: string,
): string | undefined {
  if (!uri.startsWith('file:')) return uri;
  let target: string;
  try {
    target = fileURLToPath(uri);
  } catch {
    return undefined;
  }
  const normalizedTarget = path.resolve(target);
  if (!isWithinRoot(projectRoot, normalizedTarget)) return undefined;
  const relativePath = path
    .relative(projectRoot, normalizedTarget)
    .split(path.sep)
    .join('/');
  return syntheticUri(projectId, relativePath);
}

function transformUris(
  value: unknown,
  mapper: (uri: string) => string | undefined,
): unknown | typeof OMIT {
  if (typeof value === 'string') {
    if (!value.startsWith('file:')) return value;
    return mapper(value) ?? OMIT;
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => transformUris(item, mapper))
      .filter((item): item is unknown => item !== OMIT);
  }
  if (!value || typeof value !== 'object') return value;

  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    const transformed = transformUris(item, mapper);
    if (transformed === OMIT) {
      if (/uri$/i.test(key) || key === 'uri') return OMIT;
      continue;
    }
    output[key] = transformed;
  }
  return output;
}

export function translateClientMessage(
  project: Project,
  projectRoot: string,
  message: unknown,
): unknown {
  const translated = transformUris(message, (uri) =>
    clientUriToServerUri(project.id, projectRoot, uri),
  );
  if (translated === OMIT) {
    throw new LanguageServerProtocolError(
      'A mensagem contém uma URI inválida.',
    );
  }
  return translated;
}

export function translateServerMessage(
  project: Project,
  projectRoot: string,
  message: unknown,
): unknown | undefined {
  const translated = transformUris(message, (uri) =>
    serverUriToClientUri(project.id, projectRoot, uri),
  );
  return translated === OMIT ? undefined : translated;
}

function jsonRpcId(value: unknown): string | number | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const id = (value as { id?: unknown }).id;
  return typeof id === 'string' || typeof id === 'number' ? id : undefined;
}

function jsonRpcMethod(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const method = (value as { method?: unknown }).method;
  return typeof method === 'string' ? method : undefined;
}

function sendJson(socket: WebSocket, message: unknown): void {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function sendStatus(
  socket: WebSocket,
  status: ProjectLanguageServerStatus,
): void {
  sendJson(socket, {
    jsonrpc: '2.0',
    method: 'devDashboard/languageServerStatus',
    params: status,
  });
}

function sendProtocolError(
  socket: WebSocket,
  id: string | number | undefined,
  message: string,
): void {
  if (id === undefined) {
    sendJson(socket, {
      jsonrpc: '2.0',
      method: 'window/showMessage',
      params: { type: 1, message },
    });
    return;
  }
  sendJson(socket, {
    jsonrpc: '2.0',
    id,
    error: { code: -32600, message },
  });
}

function defaultSpawnProcess(
  executable: string,
  args: readonly string[],
  cwd: string,
): ChildProcessWithoutNullStreams {
  return spawn(executable, [...args], {
    cwd,
    shell: false,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      NO_COLOR: '1',
      GIT_TERMINAL_PROMPT: '0',
    },
  });
}

async function executableCandidate(candidate: string): Promise<string | undefined> {
  try {
    await access(candidate, fsConstants.X_OK);
    return await realpath(candidate);
  } catch {
    return undefined;
  }
}

export async function findTypeScriptLanguageServer(
  projectRoot: string,
): Promise<string | undefined> {
  const candidates = [
    path.join(projectRoot, 'node_modules', '.bin', LSP_EXECUTABLE),
    ...(process.env.PATH ?? '')
      .split(path.delimiter)
      .filter(Boolean)
      .map((directory) => path.join(directory, LSP_EXECUTABLE)),
  ];

  for (const candidate of candidates) {
    const found = await executableCandidate(candidate);
    if (found) return found;
  }
  return undefined;
}

async function supportsJavaScriptTypeScript(project: Project): Promise<boolean> {
  if (project.type === 'node') return true;
  for (const signal of ['package.json', 'tsconfig.json', 'jsconfig.json']) {
    try {
      await access(path.join(project.path, signal), fsConstants.R_OK);
      return true;
    } catch {
      // Continue through the closed list of project signals.
    }
  }
  return false;
}

export class ProjectLanguageServerService {
  private readonly sessions = new Map<string, LanguageServerSession>();
  private readonly starts = new Map<string, number[]>();
  private readonly idleTimeoutMs: number;
  private readonly now: () => number;
  private readonly findExecutable: (
    projectRoot: string,
  ) => Promise<string | undefined>;
  private readonly spawnProcess: (
    executable: string,
    args: readonly string[],
    cwd: string,
  ) => ChildProcessWithoutNullStreams;

  public constructor(options: ProjectLanguageServerServiceOptions = {}) {
    this.idleTimeoutMs = options.idleTimeoutMs ?? IDLE_TIMEOUT_MS;
    this.now = options.now ?? Date.now;
    this.findExecutable = options.findExecutable ?? findTypeScriptLanguageServer;
    this.spawnProcess = options.spawnProcess ?? defaultSpawnProcess;
  }

  public async status(project: Project): Promise<ProjectLanguageServerStatus> {
    const supported = await supportsJavaScriptTypeScript(project);
    const session = this.sessions.get(project.id);
    if (session) {
      return this.sessionStatus(session, supported);
    }
    if (!supported) {
      return {
        kind: 'javascript-typescript',
        supported: false,
        available: false,
        state: 'unavailable',
        activeConnections: 0,
        message: 'Este projeto não possui sinais JavaScript/TypeScript reconhecidos.',
      };
    }

    const root = await realpath(project.path).catch(() => project.path);
    const executable = await this.findExecutable(root);
    if (!executable) {
      return {
        kind: 'javascript-typescript',
        supported: true,
        available: false,
        state: 'unavailable',
        activeConnections: 0,
        message:
          'typescript-language-server não está disponível. Instale-o manualmente para ativar recursos semânticos.',
      };
    }
    return {
      kind: 'javascript-typescript',
      supported: true,
      available: true,
      state: 'idle',
      activeConnections: 0,
      message: 'Servidor de linguagem disponível e aguardando um arquivo JavaScript ou TypeScript.',
    };
  }

  public async attach(project: Project, socket: WebSocket): Promise<void> {
    const initialStatus = await this.status(project);
    if (!initialStatus.supported || !initialStatus.available) {
      sendStatus(socket, initialStatus);
      socket.close(1000, 'Servidor de linguagem indisponível');
      return;
    }

    let session = this.sessions.get(project.id);
    if (session?.socket && session.socket.readyState === session.socket.OPEN) {
      sendStatus(socket, {
        ...initialStatus,
        state: 'failed',
        activeConnections: 1,
        message: 'Já existe uma sessão semântica ativa para este projeto.',
      });
      socket.close(1013, 'Sessão já ativa');
      return;
    }

    if (!session || session.process.exitCode !== null) {
      session = await this.start(project, initialStatus);
      if (!session) {
        sendStatus(socket, {
          ...initialStatus,
          state: 'failed',
          message: 'O servidor de linguagem reiniciou vezes demais. Tente novamente em instantes.',
        });
        socket.close(1013, 'Limite de reinício atingido');
        return;
      }
    }

    this.clearTimers(session);
    session.socket = socket;
    sendStatus(socket, this.sessionStatus(session, true));

    socket.on('message', (data: RawData, isBinary: boolean) => {
      this.handleClientMessage(session!, socket, data, isBinary);
    });
    socket.once('close', () => this.detach(session!, socket));
    socket.once('error', () => this.detach(session!, socket));
  }

  public close(): void {
    for (const session of this.sessions.values()) {
      this.clearTimers(session);
      session.socket?.close(1001, 'API encerrando');
      if (session.process.exitCode === null) session.process.kill('SIGTERM');
    }
    this.sessions.clear();
  }

  private sessionStatus(
    session: LanguageServerSession,
    supported: boolean,
  ): ProjectLanguageServerStatus {
    return {
      kind: 'javascript-typescript',
      supported,
      available: true,
      state: session.state,
      activeConnections:
        session.socket && session.socket.readyState === session.socket.OPEN ? 1 : 0,
      message:
        session.state === 'ready'
          ? 'Recursos semânticos JavaScript/TypeScript ativos.'
          : session.state === 'failed'
            ? 'O servidor de linguagem encerrou inesperadamente.'
            : 'Iniciando recursos semânticos JavaScript/TypeScript…',
      lastStartedAt: session.lastStartedAt,
    };
  }

  private async start(
    project: Project,
    initialStatus: ProjectLanguageServerStatus,
  ): Promise<LanguageServerSession | undefined> {
    const now = this.now();
    const recentStarts = (this.starts.get(project.id) ?? []).filter(
      (startedAt) => now - startedAt < RESTART_WINDOW_MS,
    );
    if (recentStarts.length >= MAX_STARTS_PER_WINDOW) return undefined;
    recentStarts.push(now);
    this.starts.set(project.id, recentStarts);

    const root = await realpath(project.path);
    const executable = await this.findExecutable(root);
    if (!executable || !initialStatus.available) return undefined;
    const child = this.spawnProcess(executable, LSP_ARGUMENTS, root);
    const session: LanguageServerSession = {
      project,
      root,
      executable,
      process: child,
      decoder: new LspMessageDecoder(),
      socket: undefined,
      state: 'starting',
      lastStartedAt: new Date(now).toISOString(),
      idleTimer: undefined,
      forceKillTimer: undefined,
    };
    this.sessions.set(project.id, session);

    child.stdout.on('data', (chunk: Buffer) => {
      try {
        for (const message of session.decoder.push(chunk)) {
          const translated = translateServerMessage(project, root, message);
          if (translated === undefined || !session.socket) continue;
          session.state = 'ready';
          sendJson(session.socket, translated);
        }
      } catch (error) {
        this.failSession(
          session,
          error instanceof Error ? error.message : 'Resposta LSP inválida.',
        );
      }
    });
    child.stderr.on('data', () => {
      // Logs internos não são enviados ao navegador.
    });
    child.once('error', () => {
      this.failSession(session, 'Não foi possível iniciar o servidor de linguagem.');
    });
    child.once('exit', () => {
      if (session.state !== 'failed') {
        this.failSession(session, 'O servidor de linguagem foi encerrado.');
      }
    });

    return session;
  }

  private handleClientMessage(
    session: LanguageServerSession,
    socket: WebSocket,
    data: RawData,
    isBinary: boolean,
  ): void {
    if (isBinary) {
      sendProtocolError(socket, undefined, 'Mensagens binárias não são aceitas pelo gateway LSP.');
      return;
    }
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
    if (buffer.length > MAX_MESSAGE_BYTES) {
      socket.close(1009, 'Mensagem LSP muito grande');
      return;
    }

    let message: unknown;
    try {
      message = JSON.parse(buffer.toString('utf8')) as unknown;
    } catch {
      sendProtocolError(socket, undefined, 'O gateway LSP recebeu JSON inválido.');
      return;
    }

    const id = jsonRpcId(message);
    const method = jsonRpcMethod(message);
    if (method === 'workspace/executeCommand') {
      sendProtocolError(
        socket,
        id,
        'workspace/executeCommand permanece bloqueado pelo dashboard.',
      );
      return;
    }

    try {
      const translated = translateClientMessage(
        session.project,
        session.root,
        message,
      );
      session.process.stdin.write(encodeLspMessage(translated));
    } catch (error) {
      sendProtocolError(
        socket,
        id,
        error instanceof Error ? error.message : 'Mensagem LSP recusada.',
      );
    }
  }

  private detach(session: LanguageServerSession, socket: WebSocket): void {
    if (session.socket !== socket) return;
    session.socket = undefined;
    this.clearTimers(session);
    session.idleTimer = setTimeout(() => {
      if (session.socket || session.process.exitCode !== null) return;
      session.process.kill('SIGTERM');
      session.forceKillTimer = setTimeout(() => {
        if (session.process.exitCode === null) session.process.kill('SIGKILL');
      }, FORCE_KILL_DELAY_MS);
    }, this.idleTimeoutMs);
  }

  private failSession(session: LanguageServerSession, message: string): void {
    if (session.state === 'failed') return;
    session.state = 'failed';
    if (session.socket) {
      sendStatus(session.socket, {
        ...this.sessionStatus(session, true),
        message,
      });
      session.socket.close(1011, 'Servidor de linguagem encerrado');
      session.socket = undefined;
    }
    this.clearTimers(session);
    if (session.process.exitCode === null) session.process.kill('SIGTERM');
    this.sessions.delete(session.project.id);
  }

  private clearTimers(session: LanguageServerSession): void {
    if (session.idleTimer) clearTimeout(session.idleTimer);
    if (session.forceKillTimer) clearTimeout(session.forceKillTimer);
    session.idleTimer = undefined;
    session.forceKillTimer = undefined;
  }
}
