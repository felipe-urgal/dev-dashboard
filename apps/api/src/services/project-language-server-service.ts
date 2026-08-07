import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { access, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import type {
  Project,
  ProjectLanguageServerKind,
  ProjectLanguageServerStatus,
  ProjectRailsLanguageServerStatus,
  ProjectRailsRuntimeConfirmation,
  ProjectSymbolLocation,
  ProjectTextPosition,
} from '@dev-dashboard/contracts';
import type { RawData, WebSocket } from 'ws';

import { ProjectFileService } from './project-file-service.js';
import { isPathWithinRoot } from './shared/path-guards.js';

const MAX_MESSAGE_BYTES = 1024 * 1024;
const SYMBOL_REQUEST_TIMEOUT_MS = 10_000;
const IDLE_TIMEOUT_MS = 60_000;
const FORCE_KILL_DELAY_MS = 2_000;
const RESTART_WINDOW_MS = 60_000;
const MAX_STARTS_PER_WINDOW = 3;
const RAILS_RUNTIME_CONFIRMATION_TTL_MS = 60_000;
const OMIT = Symbol('omit');

export const LANGUAGE_SERVER_KINDS: readonly ProjectLanguageServerKind[] = [
  'javascript-typescript',
  'ruby',
];

interface ResolvedLanguageServerCommand {
  executable: string;
  args: readonly string[];
  /** A sessão carrega o add-on ruby-lsp-rails com introspecção habilitada. */
  usesRailsRuntime: boolean;
}

interface PendingOneShotRequest {
  resolve: (message: unknown) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

interface LanguageServerSession {
  project: Project;
  kind: ProjectLanguageServerKind;
  root: string;
  executable: string;
  process: ChildProcessWithoutNullStreams;
  decoder: LspMessageDecoder;
  socket: WebSocket | undefined;
  state: 'starting' | 'ready' | 'failed';
  lastStartedAt: string;
  idleTimer: NodeJS.Timeout | undefined;
  forceKillTimer: NodeJS.Timeout | undefined;
  usesRailsRuntime: boolean;
  rails: ProjectRailsLanguageServerStatus | undefined;
  /**
   * Distinto de `state === 'failed'`: marca que a sessão já foi limpa (processo
   * morto, removida do mapa), seja por falha real ou por reinício controlado
   * (opt-in do Rails runtime). Evita que o handler de `exit` do processo
   * repita a limpeza sem confundir observabilidade — reinício controlado
   * nunca vira `state: 'failed'`.
   */
  terminated: boolean;
  /**
   * Correlator de requisição/resposta para chamadas "de uma vez" (ex.
   * ferramentas de símbolo do assistente de IA), simétrico ao `pending` map
   * que já existe do lado do cliente Monaco
   * (`project-language-server-client.ts`). Requisições de navegador não
   * passam por aqui — só as originadas pelo próprio servidor.
   */
  pending: Map<number, PendingOneShotRequest>;
}

interface RailsRuntimeConfirmationRecord {
  token: string;
  projectId: string;
  expiresAt: number;
}

export interface ProjectLanguageServerServiceOptions {
  idleTimeoutMs?: number;
  symbolRequestTimeoutMs?: number;
  now?: () => number;
  findCommand?: (
    project: Project,
    projectRoot: string,
    kind: ProjectLanguageServerKind,
    railsRuntimeEnabled: boolean,
  ) => Promise<ResolvedLanguageServerCommand | undefined>;
  spawnProcess?: (
    executable: string,
    args: readonly string[],
    cwd: string,
  ) => ChildProcessWithoutNullStreams;
  projectFileService?: ProjectFileService;
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
      !decoded ||
      decoded === '.' ||
      decoded === '..' ||
      decoded.includes('/') ||
      decoded.includes('\\') ||
      decoded.includes('\0')
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
  if (!isPathWithinRoot(projectRoot, target)) {
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
  if (!isPathWithinRoot(projectRoot, normalizedTarget)) return undefined;
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

/**
 * `textDocument/definition` aceita `Location | Location[] | LocationLink[] |
 * null`; `textDocument/references` aceita `Location[] | null`. As URIs (`uri`
 * em `Location`, `targetUri` em `LocationLink`) já chegam aqui traduzidas
 * para a URI sintética do cliente pelo `transformUris` genérico do
 * `translateServerMessage` — só falta extrair caminho relativo e converter
 * posições LSP (0-based) para `ProjectTextPosition` (1-based).
 */
function toSymbolLocations(
  projectId: string,
  result: unknown,
): ProjectSymbolLocation[] {
  if (!result) return [];
  const items = Array.isArray(result) ? result : [result];
  const locations: ProjectSymbolLocation[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const uri =
      typeof record.uri === 'string'
        ? record.uri
        : typeof record.targetUri === 'string'
          ? record.targetUri
          : undefined;
    const range = (record.range ??
      record.targetSelectionRange ??
      record.targetRange) as
      | {
          start?: { line?: number; character?: number };
          end?: { line?: number; character?: number };
        }
      | undefined;
    if (!uri || !range?.start || !range.end) continue;

    let relativePath: string;
    try {
      relativePath = relativePathFromSyntheticUri(projectId, uri);
    } catch {
      continue;
    }

    locations.push({
      path: relativePath,
      range: {
        start: {
          line: (range.start.line ?? 0) + 1,
          column: (range.start.character ?? 0) + 1,
        },
        end: {
          line: (range.end.line ?? 0) + 1,
          column: (range.end.character ?? 0) + 1,
        },
      },
    });
  }
  return locations;
}

function languageIdForPath(
  kind: ProjectLanguageServerKind,
  filePath: string,
): string {
  if (kind === 'ruby') return 'ruby';
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.tsx') return 'typescriptreact';
  if (extension === '.jsx') return 'javascriptreact';
  if (extension === '.ts' || extension === '.mts' || extension === '.cts')
    return 'typescript';
  return 'javascript';
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

async function executableCandidate(
  candidate: string,
): Promise<string | undefined> {
  try {
    await access(candidate, fsConstants.X_OK);
    return await realpath(candidate);
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

export async function findTypeScriptLanguageServer(
  projectRoot: string,
): Promise<string | undefined> {
  const executable = 'typescript-language-server';
  const candidates = [
    path.join(projectRoot, 'node_modules', '.bin', executable),
    ...(process.env.PATH ?? '')
      .split(path.delimiter)
      .filter(Boolean)
      .map((directory) => path.join(directory, executable)),
  ];

  for (const candidate of candidates) {
    const found = await executableCandidate(candidate);
    if (found) return found;
  }
  return undefined;
}

/**
 * Confere apenas o texto de `Gemfile.lock`, sem invocar `bundle`: evita
 * qualquer resolução, instalação ou side-effect a partir de uma checagem de
 * disponibilidade.
 */
export async function gemfileLockHasGem(
  projectRoot: string,
  gemName: string,
): Promise<boolean> {
  let contents: string;
  try {
    contents = await readFile(path.join(projectRoot, 'Gemfile.lock'), 'utf8');
  } catch {
    return false;
  }
  const escaped = gemName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^\\s+${escaped} \\(`, 'm').test(contents);
}

/**
 * Resolve o comando do Ruby LSP sem instalar nada:
 *  - se o bundle do projeto já resolveu `ruby-lsp` (via `Gemfile.lock`) e não
 *    carrega o add-on Rails, ou o add-on Rails já foi habilitado
 *    explicitamente, usa `bundle exec ruby-lsp --stdio`;
 *  - caso contrário, cai para um `ruby-lsp` global no PATH, que nunca herda o
 *    bundle do projeto e portanto nunca carrega o add-on Rails;
 *  - sem candidato, a capacidade fica indisponível — nunca dispara
 *    `bundle install` nem download de gems.
 */
export async function findRubyLanguageServer(
  projectRoot: string,
  railsRuntimeEnabled: boolean,
): Promise<ResolvedLanguageServerCommand | undefined> {
  const bundleResolvesLsp = await gemfileLockHasGem(projectRoot, 'ruby-lsp');
  const bundleHasRailsAddon =
    bundleResolvesLsp &&
    (await gemfileLockHasGem(projectRoot, 'ruby-lsp-rails'));

  if (bundleResolvesLsp && (!bundleHasRailsAddon || railsRuntimeEnabled)) {
    const bundle = await findExecutableOnPath('bundle');
    if (bundle) {
      return {
        executable: bundle,
        args: ['exec', 'ruby-lsp', '--stdio'],
        usesRailsRuntime: bundleHasRailsAddon && railsRuntimeEnabled,
      };
    }
  }

  const globalRubyLsp = await findExecutableOnPath('ruby-lsp');
  if (globalRubyLsp) {
    return {
      executable: globalRubyLsp,
      args: ['--stdio'],
      usesRailsRuntime: false,
    };
  }

  return undefined;
}

async function defaultFindCommand(
  _project: Project,
  projectRoot: string,
  kind: ProjectLanguageServerKind,
  railsRuntimeEnabled: boolean,
): Promise<ResolvedLanguageServerCommand | undefined> {
  if (kind === 'javascript-typescript') {
    const executable = await findTypeScriptLanguageServer(projectRoot);
    return executable
      ? { executable, args: ['--stdio'], usesRailsRuntime: false }
      : undefined;
  }
  return findRubyLanguageServer(projectRoot, railsRuntimeEnabled);
}

async function supportsJavaScriptTypeScript(
  project: Project,
): Promise<boolean> {
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

async function supportsRuby(project: Project): Promise<boolean> {
  if (project.type === 'rails') return true;
  for (const signal of ['Gemfile', '.ruby-version']) {
    try {
      await access(path.join(project.path, signal), fsConstants.R_OK);
      return true;
    } catch {
      // Continue through the closed list of project signals.
    }
  }
  return false;
}

async function supports(
  project: Project,
  kind: ProjectLanguageServerKind,
): Promise<boolean> {
  return kind === 'javascript-typescript'
    ? supportsJavaScriptTypeScript(project)
    : supportsRuby(project);
}

function sessionKey(
  projectId: string,
  kind: ProjectLanguageServerKind,
): string {
  return `${projectId}:${kind}`;
}

export class ProjectLanguageServerService {
  private readonly sessions = new Map<string, LanguageServerSession>();
  private readonly starts = new Map<string, number[]>();
  private readonly railsRuntimeEnabled = new Map<string, boolean>();
  private readonly railsRuntimeConfirmations = new Map<
    string,
    RailsRuntimeConfirmationRecord
  >();
  private readonly idleTimeoutMs: number;
  private readonly symbolRequestTimeoutMs: number;
  private readonly now: () => number;
  private readonly findCommand: (
    project: Project,
    projectRoot: string,
    kind: ProjectLanguageServerKind,
    railsRuntimeEnabled: boolean,
  ) => Promise<ResolvedLanguageServerCommand | undefined>;
  private readonly spawnProcess: (
    executable: string,
    args: readonly string[],
    cwd: string,
  ) => ChildProcessWithoutNullStreams;
  private readonly projectFileService: ProjectFileService;
  private nextOneShotRequestId = -1;

  public constructor(options: ProjectLanguageServerServiceOptions = {}) {
    this.idleTimeoutMs = options.idleTimeoutMs ?? IDLE_TIMEOUT_MS;
    this.symbolRequestTimeoutMs =
      options.symbolRequestTimeoutMs ?? SYMBOL_REQUEST_TIMEOUT_MS;
    this.now = options.now ?? Date.now;
    this.findCommand = options.findCommand ?? defaultFindCommand;
    this.spawnProcess = options.spawnProcess ?? defaultSpawnProcess;
    this.projectFileService =
      options.projectFileService ?? new ProjectFileService();
  }

  public async status(
    project: Project,
    kind: ProjectLanguageServerKind,
  ): Promise<ProjectLanguageServerStatus> {
    const supported = await supports(project, kind);
    const rails = kind === 'ruby' ? await this.railsStatus(project) : undefined;
    const session = this.sessions.get(sessionKey(project.id, kind));
    if (session) {
      return this.sessionStatus(session, supported);
    }
    if (!supported) {
      return {
        kind,
        supported: false,
        available: false,
        state: 'unavailable',
        activeConnections: 0,
        message:
          kind === 'javascript-typescript'
            ? 'Este projeto não possui sinais JavaScript/TypeScript reconhecidos.'
            : 'Este projeto não possui sinais Ruby reconhecidos.',
        ...(rails ? { rails } : {}),
      };
    }

    const root = await realpath(project.path).catch(() => project.path);
    const railsRuntimeEnabled =
      this.railsRuntimeEnabled.get(project.id) ?? false;
    const command = await this.findCommand(
      project,
      root,
      kind,
      railsRuntimeEnabled,
    );
    if (!command) {
      return {
        kind,
        supported: true,
        available: false,
        state: 'unavailable',
        activeConnections: 0,
        message:
          kind === 'javascript-typescript'
            ? 'typescript-language-server não está disponível. Instale-o manualmente para ativar recursos semânticos.'
            : 'ruby-lsp não está disponível. Instale-o globalmente ou resolva-o no bundle do projeto para ativar recursos semânticos.',
        ...(rails ? { rails } : {}),
      };
    }
    return {
      kind,
      supported: true,
      available: true,
      state: 'idle',
      activeConnections: 0,
      message:
        kind === 'javascript-typescript'
          ? 'Servidor de linguagem disponível e aguardando um arquivo JavaScript ou TypeScript.'
          : 'Servidor de linguagem disponível e aguardando um arquivo Ruby.',
      ...(rails ? { rails } : {}),
    };
  }

  public async prepareRailsRuntimeConfirmation(
    project: Project,
  ): Promise<ProjectRailsRuntimeConfirmation> {
    this.sweepRailsRuntimeConfirmations();
    const rails = await this.railsStatus(project);
    if (!rails.addonAvailable) {
      throw new LanguageServerProtocolError(
        'A gem ruby-lsp-rails não está resolvida no bundle deste projeto.',
      );
    }
    const token = randomBytes(32).toString('hex');
    const expiresAt = this.now() + RAILS_RUNTIME_CONFIRMATION_TTL_MS;
    this.railsRuntimeConfirmations.set(token, {
      token,
      projectId: project.id,
      expiresAt,
    });
    return { token, expiresAt: new Date(expiresAt).toISOString() };
  }

  public async setRailsRuntimeEnabled(
    project: Project,
    enabled: boolean,
    confirmationToken: string | undefined,
  ): Promise<ProjectLanguageServerStatus> {
    this.sweepRailsRuntimeConfirmations();
    if (enabled) {
      const record = confirmationToken
        ? this.railsRuntimeConfirmations.get(confirmationToken)
        : undefined;
      if (!record || record.projectId !== project.id) {
        throw new LanguageServerProtocolError(
          'Confirmação de introspecção Rails ausente, inválida ou expirada.',
        );
      }
      this.railsRuntimeConfirmations.delete(confirmationToken!);
      this.railsRuntimeEnabled.set(project.id, true);
    } else {
      this.railsRuntimeEnabled.set(project.id, false);
    }

    // A sessão Ruby ativa, se existir, foi resolvida com o valor anterior de
    // `railsRuntimeEnabled` (usado em `findCommand`). Ela precisa ser
    // reiniciada para que a próxima conexão resolva o comando correto —
    // caso contrário `status()` continuaria devolvendo o `session.rails`
    // desatualizado e o processo em execução não mudaria.
    const session = this.sessions.get(sessionKey(project.id, 'ruby'));
    if (session) {
      this.restartSessionForConfigChange(
        session,
        enabled
          ? 'Introspecção em tempo de execução Rails habilitada; reiniciando a sessão Ruby.'
          : 'Introspecção em tempo de execução Rails desabilitada; reiniciando a sessão Ruby.',
      );
    }
    return this.status(project, 'ruby');
  }

  public async attach(
    project: Project,
    kind: ProjectLanguageServerKind,
    socket: WebSocket,
  ): Promise<void> {
    const initialStatus = await this.status(project, kind);
    if (!initialStatus.supported || !initialStatus.available) {
      sendStatus(socket, initialStatus);
      socket.close(1000, 'Servidor de linguagem indisponível');
      return;
    }

    const key = sessionKey(project.id, kind);
    let session = this.sessions.get(key);
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
      session = await this.start(project, kind, initialStatus);
      if (!session) {
        sendStatus(socket, {
          ...initialStatus,
          state: 'failed',
          message:
            'O servidor de linguagem reiniciou vezes demais. Tente novamente em instantes.',
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

  /**
   * Requisição de LSP "de uma vez", disparada pelo servidor (ferramentas de
   * símbolo do assistente de IA) — sem depender de um WebSocket do
   * navegador. Reaproveita a mesma sessão/processo que o navegador usaria
   * (mesmo limite de reinícios), nunca um segundo processo. Retorna
   * `undefined` quando o LSP não é suportado/disponível para o
   * projeto/kind; `[]` quando a busca foi feita mas nada foi encontrado.
   */
  public async requestSymbolLocations(
    project: Project,
    kind: ProjectLanguageServerKind,
    filePath: string,
    position: ProjectTextPosition,
    method: 'textDocument/definition' | 'textDocument/references',
  ): Promise<ProjectSymbolLocation[] | undefined> {
    const initialStatus = await this.status(project, kind);
    if (!initialStatus.supported || !initialStatus.available) return undefined;

    const key = sessionKey(project.id, kind);
    let session = this.sessions.get(key);
    if (!session || session.process.exitCode !== null) {
      session = await this.start(project, kind, initialStatus);
      if (!session) return undefined;
    }
    this.clearTimers(session);

    const file = await this.projectFileService.readFile(project.path, filePath);
    const uri = pathToFileURL(path.resolve(session.root, filePath)).href;
    const languageId = languageIdForPath(kind, filePath);

    this.notifyProcess(session, 'textDocument/didOpen', {
      textDocument: { uri, languageId, version: 1, text: file.content },
    });

    try {
      const result = await this.sendOneShotRequest(session, method, {
        textDocument: { uri },
        position: {
          line: Math.max(0, position.line - 1),
          character: Math.max(0, position.column - 1),
        },
      });
      return toSymbolLocations(project.id, result);
    } finally {
      this.notifyProcess(session, 'textDocument/didClose', {
        textDocument: { uri },
      });
      if (!session.socket) this.scheduleIdleTeardown(session);
    }
  }

  private notifyProcess(
    session: LanguageServerSession,
    method: string,
    params: unknown,
  ): void {
    session.process.stdin.write(
      encodeLspMessage({ jsonrpc: '2.0', method, params }),
    );
  }

  private sendOneShotRequest(
    session: LanguageServerSession,
    method: string,
    params: unknown,
  ): Promise<unknown> {
    const id = this.nextOneShotRequestId;
    this.nextOneShotRequestId -= 1;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        session.pending.delete(id);
        reject(
          new LanguageServerProtocolError(
            'O servidor de linguagem não respondeu a tempo.',
          ),
        );
      }, this.symbolRequestTimeoutMs);
      session.pending.set(id, { resolve, reject, timeout });
      session.process.stdin.write(
        encodeLspMessage({ jsonrpc: '2.0', id, method, params }),
      );
    });
  }

  public close(): void {
    for (const session of this.sessions.values()) {
      this.clearTimers(session);
      for (const [id, request] of session.pending) {
        clearTimeout(request.timeout);
        request.reject(new LanguageServerProtocolError('API encerrando.'));
        session.pending.delete(id);
      }
      session.socket?.close(1001, 'API encerrando');
      if (session.process.exitCode === null) session.process.kill('SIGTERM');
    }
    this.sessions.clear();
  }

  private async railsStatus(
    project: Project,
  ): Promise<ProjectRailsLanguageServerStatus> {
    if (project.type !== 'rails') {
      return {
        addonAvailable: false,
        runtimeState: 'unavailable',
        message: 'Este projeto não é reconhecido como Rails.',
      };
    }
    const root = await realpath(project.path).catch(() => project.path);
    const addonAvailable = await gemfileLockHasGem(root, 'ruby-lsp-rails');
    if (!addonAvailable) {
      return {
        addonAvailable: false,
        runtimeState: 'unavailable',
        message:
          'A gem ruby-lsp-rails não está resolvida no bundle deste projeto.',
      };
    }
    const enabled = this.railsRuntimeEnabled.get(project.id) ?? false;
    return {
      addonAvailable: true,
      runtimeState: enabled ? 'enabled' : 'disabled',
      message: enabled
        ? 'Introspecção em tempo de execução Rails habilitada; o add-on pode inicializar a aplicação.'
        : 'Introspecção em tempo de execução Rails desabilitada. Habilite explicitamente para liberar recursos que inicializam a aplicação.',
    };
  }

  private sweepRailsRuntimeConfirmations(): void {
    const now = this.now();
    for (const [token, record] of this.railsRuntimeConfirmations) {
      if (record.expiresAt <= now) this.railsRuntimeConfirmations.delete(token);
    }
  }

  private sessionStatus(
    session: LanguageServerSession,
    supported: boolean,
  ): ProjectLanguageServerStatus {
    const label =
      session.kind === 'javascript-typescript'
        ? 'JavaScript/TypeScript'
        : 'Ruby';
    return {
      kind: session.kind,
      supported,
      available: true,
      state: session.state,
      activeConnections:
        session.socket && session.socket.readyState === session.socket.OPEN
          ? 1
          : 0,
      message:
        session.state === 'ready'
          ? `Recursos semânticos ${label} ativos.`
          : session.state === 'failed'
            ? 'O servidor de linguagem encerrou inesperadamente.'
            : `Iniciando recursos semânticos ${label}…`,
      lastStartedAt: session.lastStartedAt,
      ...(session.rails ? { rails: session.rails } : {}),
    };
  }

  private async start(
    project: Project,
    kind: ProjectLanguageServerKind,
    initialStatus: ProjectLanguageServerStatus,
  ): Promise<LanguageServerSession | undefined> {
    const key = sessionKey(project.id, kind);
    const now = this.now();
    const recentStarts = (this.starts.get(key) ?? []).filter(
      (startedAt) => now - startedAt < RESTART_WINDOW_MS,
    );
    if (recentStarts.length >= MAX_STARTS_PER_WINDOW) return undefined;
    recentStarts.push(now);
    this.starts.set(key, recentStarts);

    const root = await realpath(project.path);
    const railsRuntimeEnabled =
      this.railsRuntimeEnabled.get(project.id) ?? false;
    const command = await this.findCommand(
      project,
      root,
      kind,
      railsRuntimeEnabled,
    );
    if (!command || !initialStatus.available) return undefined;
    const child = this.spawnProcess(command.executable, command.args, root);
    const session: LanguageServerSession = {
      project,
      kind,
      root,
      executable: command.executable,
      process: child,
      decoder: new LspMessageDecoder(),
      socket: undefined,
      state: 'starting',
      lastStartedAt: new Date(now).toISOString(),
      idleTimer: undefined,
      forceKillTimer: undefined,
      usesRailsRuntime: command.usesRailsRuntime,
      rails: kind === 'ruby' ? await this.railsStatus(project) : undefined,
      terminated: false,
      pending: new Map(),
    };
    this.sessions.set(key, session);

    child.stdout.on('data', (chunk: Buffer) => {
      try {
        for (const message of session.decoder.push(chunk)) {
          const translated = translateServerMessage(project, root, message);
          const id = jsonRpcId(message);
          const pending =
            typeof id === 'number' ? session.pending.get(id) : undefined;
          if (pending) {
            session.pending.delete(id as number);
            clearTimeout(pending.timeout);
            if (translated === undefined) {
              pending.reject(
                new LanguageServerProtocolError(
                  'O servidor de linguagem respondeu com uma URI fora do projeto.',
                ),
              );
            } else {
              const errorField = (
                translated as { error?: { message?: string } }
              ).error;
              if (errorField) {
                pending.reject(
                  new LanguageServerProtocolError(
                    errorField.message ??
                      'O servidor de linguagem respondeu com erro.',
                  ),
                );
              } else {
                pending.resolve(
                  (translated as { result?: unknown }).result ?? null,
                );
              }
            }
          }
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
      this.failSession(
        session,
        'Não foi possível iniciar o servidor de linguagem.',
      );
    });
    child.once('exit', () => {
      if (!session.terminated) {
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
      sendProtocolError(
        socket,
        undefined,
        'Mensagens binárias não são aceitas pelo gateway LSP.',
      );
      return;
    }
    const buffer = Buffer.isBuffer(data)
      ? data
      : Buffer.from(data as ArrayBuffer);
    if (buffer.length > MAX_MESSAGE_BYTES) {
      socket.close(1009, 'Mensagem LSP muito grande');
      return;
    }

    let message: unknown;
    try {
      message = JSON.parse(buffer.toString('utf8')) as unknown;
    } catch {
      sendProtocolError(
        socket,
        undefined,
        'O gateway LSP recebeu JSON inválido.',
      );
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
    this.scheduleIdleTeardown(session);
  }

  /**
   * Reaproveitado por `detach` (navegador desconectou) e por
   * `requestSymbolLocations` (chamada one-shot terminou): sem isso, uma
   * sessão de LSP criada só para responder uma ferramenta de IA, sem
   * nenhum navegador jamais anexado, nunca seria encerrada.
   */
  private scheduleIdleTeardown(session: LanguageServerSession): void {
    this.clearTimers(session);
    session.idleTimer = setTimeout(() => {
      if (session.socket || session.process.exitCode !== null) return;
      session.process.kill('SIGTERM');
      session.forceKillTimer = setTimeout(() => {
        if (session.process.exitCode === null) session.process.kill('SIGKILL');
      }, FORCE_KILL_DELAY_MS);
    }, this.idleTimeoutMs);
  }

  /**
   * Encerra uma sessão saudável porque a configuração que determina o comando
   * usado para iniciá-la mudou (opt-in do Rails runtime). Diferente de
   * `failSession`, isto não é uma falha: o cliente reconecta automaticamente
   * (código 1012, "service restart") e a próxima chamada a `start()` resolve
   * o comando com o valor atual de `railsRuntimeEnabled`.
   */
  private restartSessionForConfigChange(
    session: LanguageServerSession,
    message: string,
  ): void {
    if (session.terminated) return;
    this.clearTimers(session);
    if (session.socket) {
      const socket = session.socket;
      // Zera antes de fechar: o fechamento síncrono do socket fake usado nos
      // testes emite 'close' de imediato, e o handler registrado em `attach`
      // chama `detach`, que só arma um novo idle timer se `session.socket`
      // ainda apontar para este socket.
      session.socket = undefined;
      sendStatus(socket, {
        ...this.sessionStatus(session, true),
        state: 'starting',
        message,
      });
      socket.close(1012, message);
    }
    // `terminated` (não `state: 'failed'`) evita que o handler de `exit` do
    // processo repita a limpeza. Um reinício controlado não é uma falha, então
    // `session.state` propositalmente não vira `'failed'` aqui — isso ficaria
    // incorreto em métricas/observabilidade que distinguem os dois casos.
    session.terminated = true;
    if (session.process.exitCode === null) session.process.kill('SIGTERM');
    this.sessions.delete(sessionKey(session.project.id, session.kind));
  }

  private failSession(session: LanguageServerSession, message: string): void {
    if (session.terminated) return;
    session.state = 'failed';
    this.clearTimers(session);
    for (const [id, request] of session.pending) {
      clearTimeout(request.timeout);
      request.reject(new LanguageServerProtocolError(message));
      session.pending.delete(id);
    }
    if (session.socket) {
      const socket = session.socket;
      // Zera antes de fechar: o fechamento síncrono do socket fake usado nos
      // testes emite 'close' de imediato, e `detach` só arma um novo idle
      // timer se `session.socket` ainda apontar para este socket.
      session.socket = undefined;
      sendStatus(socket, {
        ...this.sessionStatus(session, true),
        message,
      });
      socket.close(1011, 'Servidor de linguagem encerrado');
    }
    session.terminated = true;
    if (session.process.exitCode === null) session.process.kill('SIGTERM');
    this.sessions.delete(sessionKey(session.project.id, session.kind));
  }

  private clearTimers(session: LanguageServerSession): void {
    if (session.idleTimer) clearTimeout(session.idleTimer);
    if (session.forceKillTimer) clearTimeout(session.forceKillTimer);
    session.idleTimer = undefined;
    session.forceKillTimer = undefined;
  }
}
