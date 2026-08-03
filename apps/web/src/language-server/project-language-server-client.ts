import type * as Monaco from 'monaco-editor';

import type {
  ProjectFileContent,
  ProjectFileSearchMatch,
  ProjectLanguageServerStatus,
  ProjectWorkspaceEditPreview,
  ProjectWorkspaceEditRequest,
  ProjectWorkspaceTextEdit,
} from '@dev-dashboard/contracts';

import {
  fetchProjectFileContent,
  fetchProjectLanguageServerStatus,
  previewProjectWorkspaceEdit,
  projectLanguageServerWebSocketUrl,
} from '../api';

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RECONNECT_ATTEMPTS = 2;
const MARKER_OWNER = 'dev-dashboard-lsp';
const SUPPORTED_LANGUAGES = new Set(['javascript', 'typescript']);

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: unknown;
}

interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string };
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: number;
}

interface LspPosition {
  line: number;
  character: number;
}

interface LspRange {
  start: LspPosition;
  end: LspPosition;
}

interface LspLocation {
  uri: string;
  range: LspRange;
}

interface LspLocationLink {
  targetUri: string;
  targetRange: LspRange;
  targetSelectionRange: LspRange;
  originSelectionRange?: LspRange;
}

interface LspTextEdit {
  range: LspRange;
  newText: string;
}

interface LspDiagnostic {
  range: LspRange;
  severity?: number;
  code?: string | number;
  source?: string;
  message: string;
  tags?: number[];
}

interface LanguageDocument {
  path: string;
  language: string;
  version: string;
  diskContent: string;
  model: Monaco.editor.ITextModel;
  listener: Monaco.IDisposable;
  lspVersion: number;
}

export interface ProjectLanguageServerClientCallbacks {
  onStatus: (status: ProjectLanguageServerStatus) => void;
  onDiagnostics: (message: string) => void;
  onWorkspaceEdit: (preview: ProjectWorkspaceEditPreview) => void;
  onError: (message: string) => void;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function modelPath(projectId: string, filePath: string): string {
  const encoded = filePath
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `file:///dev-dashboard/projects/${encodeURIComponent(projectId)}/${encoded}`;
}

function projectRootUri(projectId: string): string {
  return `file:///dev-dashboard/projects/${encodeURIComponent(projectId)}`;
}

function pathFromUri(projectId: string, uri: string): string | undefined {
  const root = projectRootUri(projectId);
  if (!uri.startsWith(`${root}/`)) return undefined;
  try {
    const segments = uri
      .slice(root.length + 1)
      .split('/')
      .map((segment) => decodeURIComponent(segment));
    if (
      segments.some(
        (segment) =>
          !segment
          || segment === '.'
          || segment === '..'
          || segment.includes('/')
          || segment.includes('\\'),
      )
    ) return undefined;
    return segments.join('/');
  } catch {
    return undefined;
  }
}

function lspPosition(position: Monaco.Position): LspPosition {
  return {
    line: position.lineNumber - 1,
    character: position.column - 1,
  };
}

function monacoRange(range: LspRange): Monaco.IRange {
  return {
    startLineNumber: range.start.line + 1,
    startColumn: range.start.character + 1,
    endLineNumber: range.end.line + 1,
    endColumn: range.end.character + 1,
  };
}

function projectEdit(edit: LspTextEdit): ProjectWorkspaceTextEdit {
  return {
    range: {
      start: {
        line: edit.range.start.line + 1,
        column: edit.range.start.character + 1,
      },
      end: {
        line: edit.range.end.line + 1,
        column: edit.range.end.character + 1,
      },
    },
    newText: edit.newText,
  };
}

function markerSeverity(monaco: typeof Monaco, severity?: number): Monaco.MarkerSeverity {
  if (severity === 1) return monaco.MarkerSeverity.Error;
  if (severity === 2) return monaco.MarkerSeverity.Warning;
  if (severity === 3) return monaco.MarkerSeverity.Info;
  return monaco.MarkerSeverity.Hint;
}

function completionKind(
  monaco: typeof Monaco,
  kind?: number,
): Monaco.languages.CompletionItemKind {
  const kinds = monaco.languages.CompletionItemKind;
  const mapping: Record<number, Monaco.languages.CompletionItemKind> = {
    1: kinds.Text,
    2: kinds.Method,
    3: kinds.Function,
    4: kinds.Constructor,
    5: kinds.Field,
    6: kinds.Variable,
    7: kinds.Class,
    8: kinds.Interface,
    9: kinds.Module,
    10: kinds.Property,
    11: kinds.Unit,
    12: kinds.Value,
    13: kinds.Enum,
    14: kinds.Keyword,
    15: kinds.Snippet,
    16: kinds.Color,
    17: kinds.File,
    18: kinds.Reference,
    19: kinds.Folder,
    20: kinds.EnumMember,
    21: kinds.Constant,
    22: kinds.Struct,
    23: kinds.Event,
    24: kinds.Operator,
    25: kinds.TypeParameter,
  };
  return mapping[kind ?? 0] ?? kinds.Text;
}

function symbolKind(
  monaco: typeof Monaco,
  kind?: number,
): Monaco.languages.SymbolKind {
  const kinds = monaco.languages.SymbolKind;
  const mapping: Record<number, Monaco.languages.SymbolKind> = {
    1: kinds.File,
    2: kinds.Module,
    3: kinds.Namespace,
    4: kinds.Package,
    5: kinds.Class,
    6: kinds.Method,
    7: kinds.Property,
    8: kinds.Field,
    9: kinds.Constructor,
    10: kinds.Enum,
    11: kinds.Interface,
    12: kinds.Function,
    13: kinds.Variable,
    14: kinds.Constant,
    15: kinds.String,
    16: kinds.Number,
    17: kinds.Boolean,
    18: kinds.Array,
    19: kinds.Object,
    20: kinds.Key,
    21: kinds.Null,
    22: kinds.EnumMember,
    23: kinds.Struct,
    24: kinds.Event,
    25: kinds.Operator,
    26: kinds.TypeParameter,
  };
  return mapping[kind ?? 0] ?? kinds.Variable;
}

function markdownContents(value: unknown): Monaco.IMarkdownString[] {
  const values = Array.isArray(value) ? value : [value];
  return values.flatMap((item): Monaco.IMarkdownString[] => {
    if (typeof item === 'string') return [{ value: item }];
    if (!isObject(item)) return [];
    if (typeof item.value === 'string') {
      if (typeof item.language === 'string') {
        return [{ value: `\`\`\`${item.language}\n${item.value}\n\`\`\`` }];
      }
      return [{ value: item.value }];
    }
    return [];
  });
}

function locations(value: unknown): Array<LspLocation | LspLocationLink> {
  if (!value) return [];
  return (Array.isArray(value) ? value : [value]).filter(
    (item): item is LspLocation | LspLocationLink => isObject(item),
  );
}

function messageData(event: MessageEvent): Promise<string> {
  if (typeof event.data === 'string') return Promise.resolve(event.data);
  if (event.data instanceof Blob) return event.data.text();
  return Promise.resolve('');
}

export class ProjectLanguageServerClient {
  private readonly documents = new Map<string, LanguageDocument>();
  private readonly providers: Monaco.IDisposable[] = [];
  private readonly pending = new Map<number | string, PendingRequest>();
  private readonly diagnosticCounts = new Map<string, { errors: number; warnings: number }>();
  private socket?: WebSocket;
  private nextRequestId = 1;
  private ready = false;
  private disposed = false;
  private reconnectAttempts = 0;
  private reconnectTimer?: number;

  public constructor(
    private readonly monaco: typeof Monaco,
    private readonly projectId: string,
    private readonly projectName: string,
    private readonly callbacks: ProjectLanguageServerClientCallbacks,
  ) {
    this.registerProviders();
  }

  public openFile(file: ProjectFileContent, model: Monaco.editor.ITextModel): void {
    if (!SUPPORTED_LANGUAGES.has(file.language)) return;
    const existing = this.documents.get(file.path);
    if (existing) {
      existing.version = file.version;
      existing.diskContent = file.content;
      return;
    }

    const document: LanguageDocument = {
      path: file.path,
      language: file.language,
      version: file.version,
      diskContent: file.content,
      model,
      lspVersion: 1,
      listener: model.onDidChangeContent(() => {
        document.lspVersion += 1;
        if (!this.ready) return;
        this.notify('textDocument/didChange', {
          textDocument: {
            uri: model.uri.toString(),
            version: document.lspVersion,
          },
          contentChanges: [{ text: model.getValue() }],
        });
      }),
    };
    this.documents.set(file.path, document);

    if (this.ready) this.didOpen(document);
    else void this.connect();
  }

  public closeFile(filePath: string): void {
    const document = this.documents.get(filePath);
    if (!document) return;
    if (this.ready) {
      this.notify('textDocument/didClose', {
        textDocument: { uri: document.model.uri.toString() },
      });
    }
    this.monaco.editor.setModelMarkers(document.model, MARKER_OWNER, []);
    document.listener.dispose();
    this.documents.delete(filePath);
    this.diagnosticCounts.delete(filePath);
    this.announceDiagnostics();
    if (this.documents.size === 0) this.disconnect(true);
  }

  public savedFile(file: ProjectFileContent): void {
    const document = this.documents.get(file.path);
    if (!document) return;
    document.version = file.version;
    document.diskContent = file.content;
    if (this.ready) {
      this.notify('textDocument/didSave', {
        textDocument: { uri: document.model.uri.toString() },
        text: document.model.getValue(),
      });
    }
  }

  public async workspaceSymbols(query: string): Promise<ProjectFileSearchMatch[]> {
    if (!this.ready || query.trim().length < 1) return [];
    const response = await this.request<unknown>('workspace/symbol', {
      query: query.trim(),
    }).catch(() => []);
    if (!Array.isArray(response)) return [];

    return response.flatMap((item): ProjectFileSearchMatch[] => {
      if (!isObject(item) || typeof item.name !== 'string') return [];
      const location = isObject(item.location) ? item.location : undefined;
      const uri = location && typeof location.uri === 'string' ? location.uri : undefined;
      const range = location && isObject(location.range)
        ? (location.range as unknown as LspRange)
        : undefined;
      if (!uri || !range) return [];
      const filePath = pathFromUri(this.projectId, uri);
      if (!filePath) return [];
      return [{
        path: filePath,
        name: filePath.split('/').at(-1) ?? filePath,
        language: this.documents.get(filePath)?.language ?? 'typescript',
        line: range.start.line + 1,
        column: range.start.character + 1,
        preview: item.name,
      }];
    });
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.reconnectTimer) window.clearTimeout(this.reconnectTimer);
    for (const document of this.documents.values()) {
      this.monaco.editor.setModelMarkers(document.model, MARKER_OWNER, []);
      document.listener.dispose();
    }
    this.documents.clear();
    for (const provider of this.providers) provider.dispose();
    this.providers.length = 0;
    this.disconnect(true);
  }

  private async connect(): Promise<void> {
    if (
      this.disposed
      || this.socket
      || this.documents.size === 0
    ) return;

    let status: ProjectLanguageServerStatus;
    try {
      status = await fetchProjectLanguageServerStatus(this.projectId);
    } catch (error) {
      this.callbacks.onError(
        error instanceof Error
          ? error.message
          : 'Não foi possível consultar o servidor de linguagem.',
      );
      return;
    }
    this.callbacks.onStatus(status);
    if (!status.available) return;

    const socket = new WebSocket(projectLanguageServerWebSocketUrl(this.projectId));
    this.socket = socket;
    socket.addEventListener('open', () => void this.initialize());
    socket.addEventListener('message', (event) => void this.handleMessage(event));
    socket.addEventListener('close', () => this.handleClose(socket));
    socket.addEventListener('error', () => {
      if (this.socket === socket) {
        this.callbacks.onError('A conexão com o servidor de linguagem falhou.');
      }
    });
  }

  private async initialize(): Promise<void> {
    try {
      await this.request('initialize', {
        processId: null,
        clientInfo: {
          name: 'Dev Dashboard',
          version: '0.1.0',
        },
        rootUri: projectRootUri(this.projectId),
        workspaceFolders: [{
          uri: projectRootUri(this.projectId),
          name: this.projectName,
        }],
        capabilities: {
          workspace: {
            applyEdit: true,
            configuration: true,
            workspaceFolders: true,
            symbol: { dynamicRegistration: false },
            workspaceEdit: {
              documentChanges: true,
              resourceOperations: [],
            },
          },
          textDocument: {
            synchronization: {
              dynamicRegistration: false,
              didSave: true,
            },
            completion: {
              dynamicRegistration: false,
              completionItem: {
                snippetSupport: true,
                documentationFormat: ['markdown', 'plaintext'],
              },
            },
            hover: {
              dynamicRegistration: false,
              contentFormat: ['markdown', 'plaintext'],
            },
            definition: { dynamicRegistration: false, linkSupport: true },
            references: { dynamicRegistration: false },
            documentSymbol: {
              dynamicRegistration: false,
              hierarchicalDocumentSymbolSupport: true,
            },
            publishDiagnostics: {
              relatedInformation: true,
              tagSupport: { valueSet: [1, 2] },
            },
          },
        },
        initializationOptions: {
          preferences: {
            includeCompletionsForModuleExports: true,
            includeCompletionsWithInsertText: true,
          },
        },
      });
      this.notify('initialized', {});
      this.ready = true;
      this.reconnectAttempts = 0;
      for (const document of this.documents.values()) this.didOpen(document);
      this.callbacks.onStatus({
        kind: 'javascript-typescript',
        supported: true,
        available: true,
        state: 'ready',
        activeConnections: 1,
        message: 'Recursos semânticos JavaScript/TypeScript ativos.',
      });
    } catch (error) {
      this.callbacks.onError(
        error instanceof Error
          ? error.message
          : 'O servidor de linguagem não concluiu a inicialização.',
      );
      this.disconnect(false);
    }
  }

  private didOpen(document: LanguageDocument): void {
    this.notify('textDocument/didOpen', {
      textDocument: {
        uri: document.model.uri.toString(),
        languageId: document.language,
        version: document.lspVersion,
        text: document.model.getValue(),
      },
    });
  }

  private async handleMessage(event: MessageEvent): Promise<void> {
    const raw = await messageData(event);
    if (!raw) return;
    let message: JsonRpcRequest | JsonRpcNotification | JsonRpcResponse;
    try {
      message = JSON.parse(raw) as JsonRpcRequest | JsonRpcNotification | JsonRpcResponse;
    } catch {
      this.callbacks.onError('O servidor de linguagem enviou uma resposta inválida.');
      return;
    }

    if ('id' in message && !('method' in message)) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      window.clearTimeout(pending.timeout);
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
      return;
    }

    if (!('method' in message)) return;
    if ('id' in message) {
      await this.handleServerRequest(message);
      return;
    }
    this.handleNotification(message);
  }

  private handleNotification(message: JsonRpcNotification): void {
    if (message.method === 'devDashboard/languageServerStatus') {
      this.callbacks.onStatus(message.params as ProjectLanguageServerStatus);
      return;
    }
    if (message.method === 'textDocument/publishDiagnostics') {
      this.publishDiagnostics(message.params);
      return;
    }
    if (message.method === 'window/showMessage' && isObject(message.params)) {
      const text = message.params.message;
      if (typeof text === 'string') this.callbacks.onError(text);
    }
  }

  private async handleServerRequest(message: JsonRpcRequest): Promise<void> {
    try {
      if (message.method === 'workspace/configuration') {
        const items = isObject(message.params) && Array.isArray(message.params.items)
          ? message.params.items
          : [];
        this.respond(message.id, items.map(() => ({
          tabSize: 2,
          insertSpaces: true,
        })));
        return;
      }
      if (message.method === 'workspace/workspaceFolders') {
        this.respond(message.id, [{
          uri: projectRootUri(this.projectId),
          name: this.projectName,
        }]);
        return;
      }
      if (
        message.method === 'client/registerCapability'
        || message.method === 'client/unregisterCapability'
        || message.method === 'window/showMessageRequest'
      ) {
        this.respond(message.id, null);
        return;
      }
      if (message.method === 'workspace/applyEdit') {
        const edit = isObject(message.params) ? message.params.edit : undefined;
        const preview = await this.previewWorkspaceEdit(edit);
        this.callbacks.onWorkspaceEdit(preview);
        this.respond(message.id, {
          applied: false,
          failureReason:
            'A alteração foi encaminhada para revisão segura no dashboard.',
        });
        return;
      }
      this.respondError(
        message.id,
        -32601,
        `O método ${message.method} não é executado automaticamente.`,
      );
    } catch (error) {
      this.respondError(
        message.id,
        -32603,
        error instanceof Error ? error.message : 'Solicitação LSP recusada.',
      );
      this.callbacks.onError(
        error instanceof Error ? error.message : 'Solicitação LSP recusada.',
      );
    }
  }

  private publishDiagnostics(params: unknown): void {
    if (!isObject(params) || typeof params.uri !== 'string') return;
    const filePath = pathFromUri(this.projectId, params.uri);
    if (!filePath) return;
    const document = this.documents.get(filePath);
    if (!document) return;
    const diagnostics = Array.isArray(params.diagnostics)
      ? params.diagnostics.filter((item): item is LspDiagnostic => isObject(item))
      : [];
    const markers: Monaco.editor.IMarkerData[] = diagnostics.flatMap(
      (diagnostic): Monaco.editor.IMarkerData[] => {
        if (!diagnostic.range || typeof diagnostic.message !== 'string') return [];
        const range = monacoRange(diagnostic.range);
        return [{
          ...range,
          severity: markerSeverity(this.monaco, diagnostic.severity),
          message: diagnostic.message,
          ...(diagnostic.source ? { source: diagnostic.source } : {}),
          ...(diagnostic.code !== undefined
            ? { code: String(diagnostic.code) }
            : {}),
          ...(diagnostic.tags?.includes(1)
            ? { tags: [this.monaco.MarkerTag.Unnecessary] }
            : diagnostic.tags?.includes(2)
              ? { tags: [this.monaco.MarkerTag.Deprecated] }
              : {}),
        }];
      },
    );
    this.monaco.editor.setModelMarkers(document.model, MARKER_OWNER, markers);
    this.diagnosticCounts.set(filePath, {
      errors: markers.filter(
        (marker) => marker.severity === this.monaco.MarkerSeverity.Error,
      ).length,
      warnings: markers.filter(
        (marker) => marker.severity === this.monaco.MarkerSeverity.Warning,
      ).length,
    });
    this.announceDiagnostics();
  }

  private announceDiagnostics(): void {
    let errors = 0;
    let warnings = 0;
    for (const count of this.diagnosticCounts.values()) {
      errors += count.errors;
      warnings += count.warnings;
    }
    if (errors === 0 && warnings === 0) {
      this.callbacks.onDiagnostics('Sem diagnósticos semânticos nos arquivos abertos.');
      return;
    }
    this.callbacks.onDiagnostics(
      `${errors} ${errors === 1 ? 'erro' : 'erros'} e ${warnings} ${warnings === 1 ? 'aviso' : 'avisos'} nos arquivos abertos.`,
    );
  }

  private async previewWorkspaceEdit(
    editValue: unknown,
  ): Promise<ProjectWorkspaceEditPreview> {
    if (!isObject(editValue)) {
      throw new Error('O servidor propôs uma alteração vazia ou inválida.');
    }
    const editsByPath = new Map<string, LspTextEdit[]>();

    if (isObject(editValue.changes)) {
      for (const [uri, edits] of Object.entries(editValue.changes)) {
        this.appendTextEdits(editsByPath, uri, edits);
      }
    }

    if (Array.isArray(editValue.documentChanges)) {
      for (const change of editValue.documentChanges) {
        if (!isObject(change) || !isObject(change.textDocument)) {
          throw new Error(
            'Criação, renomeação e exclusão propostas pelo LSP permanecem bloqueadas.',
          );
        }
        const uri = change.textDocument.uri;
        if (typeof uri !== 'string') {
          throw new Error('O servidor propôs uma URI inválida.');
        }
        this.appendTextEdits(editsByPath, uri, change.edits);
      }
    }

    if (editsByPath.size === 0) {
      throw new Error('O servidor não propôs alterações textuais revisáveis.');
    }

    const files: ProjectWorkspaceEditRequest['files'] = [];
    for (const [filePath, edits] of editsByPath) {
      const document = this.documents.get(filePath);
      let expectedVersion: string;
      if (document) {
        if (document.model.getValue() !== document.diskContent) {
          throw new Error(
            `Salve ${filePath} antes de revisar uma alteração semântica neste arquivo.`,
          );
        }
        expectedVersion = document.version;
      } else {
        expectedVersion = (
          await fetchProjectFileContent(this.projectId, filePath)
        ).version;
      }
      files.push({
        path: filePath,
        expectedVersion,
        edits: edits.map(projectEdit),
      });
    }

    return previewProjectWorkspaceEdit(this.projectId, { files });
  }

  private appendTextEdits(
    output: Map<string, LspTextEdit[]>,
    uri: string,
    edits: unknown,
  ): void {
    const filePath = pathFromUri(this.projectId, uri);
    if (!filePath) throw new Error('O LSP propôs uma alteração fora do projeto.');
    if (!Array.isArray(edits) || edits.length === 0) {
      throw new Error(`O LSP propôs edições inválidas para ${filePath}.`);
    }
    const parsed = edits.filter(
      (edit): edit is LspTextEdit =>
        isObject(edit)
        && isObject(edit.range)
        && typeof edit.newText === 'string',
    );
    if (parsed.length !== edits.length) {
      throw new Error(`O LSP propôs edições inválidas para ${filePath}.`);
    }
    output.set(filePath, [...(output.get(filePath) ?? []), ...parsed]);
  }

  private registerProviders(): void {
    for (const language of SUPPORTED_LANGUAGES) {
      this.providers.push(
        this.monaco.languages.registerHoverProvider(language, {
          provideHover: async (model, position, token) => {
            if (!this.ownsModel(model) || !this.ready || token.isCancellationRequested) {
              return null;
            }
            const response = await this.request<unknown>('textDocument/hover', {
              textDocument: { uri: model.uri.toString() },
              position: lspPosition(position),
            }).catch(() => null);
            if (!isObject(response)) return null;
            const contents = markdownContents(response.contents);
            if (contents.length === 0) return null;
            return {
              contents,
              ...(isObject(response.range)
                ? { range: monacoRange(response.range as unknown as LspRange) }
                : {}),
            };
          },
        }),
        this.monaco.languages.registerDefinitionProvider(language, {
          provideDefinition: async (model, position, token) => {
            if (!this.ownsModel(model) || !this.ready || token.isCancellationRequested) {
              return null;
            }
            const response = await this.request<unknown>('textDocument/definition', {
              textDocument: { uri: model.uri.toString() },
              position: lspPosition(position),
            }).catch(() => null);
            return locations(response).flatMap((location) => {
              if ('targetUri' in location) {
                return [{
                  uri: this.monaco.Uri.parse(location.targetUri),
                  range: monacoRange(location.targetRange),
                  targetSelectionRange: monacoRange(location.targetSelectionRange),
                  ...(location.originSelectionRange
                    ? { originSelectionRange: monacoRange(location.originSelectionRange) }
                    : {}),
                }];
              }
              return [{
                uri: this.monaco.Uri.parse(location.uri),
                range: monacoRange(location.range),
              }];
            });
          },
        }),
        this.monaco.languages.registerReferenceProvider(language, {
          provideReferences: async (model, position, context, token) => {
            if (!this.ownsModel(model) || !this.ready || token.isCancellationRequested) {
              return null;
            }
            const response = await this.request<unknown>('textDocument/references', {
              textDocument: { uri: model.uri.toString() },
              position: lspPosition(position),
              context: { includeDeclaration: context.includeDeclaration },
            }).catch(() => null);
            return locations(response).flatMap((location) => {
              if (!('uri' in location)) return [];
              return [{
                uri: this.monaco.Uri.parse(location.uri),
                range: monacoRange(location.range),
              }];
            });
          },
        }),
        this.monaco.languages.registerCompletionItemProvider(language, {
          triggerCharacters: ['.', '"', "'", '/', '@', '<'],
          provideCompletionItems: async (model, position, context, token) => {
            if (!this.ownsModel(model) || !this.ready || token.isCancellationRequested) {
              return { suggestions: [] };
            }
            const response = await this.request<unknown>('textDocument/completion', {
              textDocument: { uri: model.uri.toString() },
              position: lspPosition(position),
              context: {
                triggerKind: context.triggerKind + 1,
                ...(context.triggerCharacter
                  ? { triggerCharacter: context.triggerCharacter }
                  : {}),
              },
            }).catch(() => null);
            const items = Array.isArray(response)
              ? response
              : isObject(response) && Array.isArray(response.items)
                ? response.items
                : [];
            const word = model.getWordUntilPosition(position);
            const defaultRange: Monaco.IRange = {
              startLineNumber: position.lineNumber,
              endLineNumber: position.lineNumber,
              startColumn: word.startColumn,
              endColumn: word.endColumn,
            };
            const suggestions = items.flatMap((item): Monaco.languages.CompletionItem[] => {
              if (!isObject(item)) return [];
              const label = typeof item.label === 'string'
                ? item.label
                : isObject(item.label) && typeof item.label.label === 'string'
                  ? item.label.label
                  : undefined;
              if (!label) return [];
              const textEdit = isObject(item.textEdit) && isObject(item.textEdit.range)
                ? item.textEdit
                : undefined;
              const insertText = textEdit && typeof textEdit.newText === 'string'
                ? textEdit.newText
                : typeof item.insertText === 'string'
                  ? item.insertText
                  : label;
              return [{
                label,
                kind: completionKind(
                  this.monaco,
                  typeof item.kind === 'number' ? item.kind : undefined,
                ),
                insertText,
                range: textEdit
                  ? monacoRange(textEdit.range as unknown as LspRange)
                  : defaultRange,
                ...(typeof item.detail === 'string' ? { detail: item.detail } : {}),
                ...(item.documentation
                  ? { documentation: markdownContents(item.documentation)[0] }
                  : {}),
                ...(item.insertTextFormat === 2
                  ? {
                      insertTextRules:
                        this.monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                    }
                  : {}),
                ...(typeof item.sortText === 'string' ? { sortText: item.sortText } : {}),
                ...(typeof item.filterText === 'string' ? { filterText: item.filterText } : {}),
              }];
            });
            return {
              suggestions,
              incomplete: isObject(response) && response.isIncomplete === true,
            };
          },
        }),
        this.monaco.languages.registerDocumentSymbolProvider(language, {
          provideDocumentSymbols: async (model, token) => {
            if (!this.ownsModel(model) || !this.ready || token.isCancellationRequested) {
              return [];
            }
            const response = await this.request<unknown>('textDocument/documentSymbol', {
              textDocument: { uri: model.uri.toString() },
            }).catch(() => []);
            if (!Array.isArray(response)) return [];
            return this.documentSymbols(response);
          },
        }),
      );
    }
  }

  private documentSymbols(items: unknown[]): Monaco.languages.DocumentSymbol[] {
    return items.flatMap((item): Monaco.languages.DocumentSymbol[] => {
      if (!isObject(item) || typeof item.name !== 'string') return [];
      const range = isObject(item.range)
        ? item.range as unknown as LspRange
        : isObject(item.location) && isObject(item.location.range)
          ? item.location.range as unknown as LspRange
          : undefined;
      if (!range) return [];
      const selectionRange = isObject(item.selectionRange)
        ? item.selectionRange as unknown as LspRange
        : range;
      return [{
        name: item.name,
        detail: typeof item.detail === 'string' ? item.detail : '',
        kind: symbolKind(
          this.monaco,
          typeof item.kind === 'number' ? item.kind : undefined,
        ),
        range: monacoRange(range),
        selectionRange: monacoRange(selectionRange),
        children: Array.isArray(item.children)
          ? this.documentSymbols(item.children)
          : [],
      }];
    });
  }

  private ownsModel(model: Monaco.editor.ITextModel): boolean {
    return model.uri.toString().startsWith(`${projectRootUri(this.projectId)}/`);
  }

  private request<T = unknown>(method: string, params?: unknown): Promise<T> {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('Servidor de linguagem desconectado.'));
    }
    const id = this.nextRequestId;
    this.nextRequestId += 1;
    const message: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      ...(params === undefined ? {} : { params }),
    };
    return new Promise<T>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`O servidor de linguagem não respondeu a ${method}.`));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        timeout,
      });
      socket.send(JSON.stringify(message));
    });
  }

  private notify(method: string, params?: unknown): void {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    const message: JsonRpcNotification = {
      jsonrpc: '2.0',
      method,
      ...(params === undefined ? {} : { params }),
    };
    socket.send(JSON.stringify(message));
  }

  private respond(id: number | string, result: unknown): void {
    this.socket?.send(JSON.stringify({ jsonrpc: '2.0', id, result }));
  }

  private respondError(
    id: number | string,
    code: number,
    message: string,
  ): void {
    this.socket?.send(JSON.stringify({
      jsonrpc: '2.0',
      id,
      error: { code, message },
    }));
  }

  private handleClose(socket: WebSocket): void {
    if (this.socket !== socket) return;
    this.socket = undefined;
    this.ready = false;
    for (const pending of this.pending.values()) {
      window.clearTimeout(pending.timeout);
      pending.reject(new Error('A conexão com o servidor de linguagem foi encerrada.'));
    }
    this.pending.clear();
    if (this.disposed || this.documents.size === 0) return;
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      this.callbacks.onError(
        'O servidor de linguagem falhou repetidamente. O Monaco local continua disponível.',
      );
      return;
    }
    this.reconnectAttempts += 1;
    this.reconnectTimer = window.setTimeout(
      () => void this.connect(),
      this.reconnectAttempts * 1_500,
    );
  }

  private disconnect(intentional: boolean): void {
    const socket = this.socket;
    this.socket = undefined;
    this.ready = false;
    if (intentional) this.reconnectAttempts = MAX_RECONNECT_ATTEMPTS;
    if (socket && socket.readyState < WebSocket.CLOSING) {
      socket.close(1000, 'Editor sem documentos JavaScript/TypeScript');
    }
  }
}

export { modelPath as projectLanguageServerModelUri };
