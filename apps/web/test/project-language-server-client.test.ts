import assert from 'node:assert/strict';
import { beforeEach, test, vi } from 'vitest';

import type * as Monaco from 'monaco-editor';
import type {
  ProjectFileContent,
  ProjectLanguageServerStatus,
  ProjectWorkspaceEditPreview,
} from '@dev-dashboard/contracts';

const api = vi.hoisted(() => ({
  status: vi.fn(),
  file: vi.fn(),
  preview: vi.fn(),
}));

vi.mock('../src/api', () => ({
  fetchProjectLanguageServerStatus: api.status,
  fetchProjectFileContent: api.file,
  previewProjectWorkspaceEdit: api.preview,
  projectLanguageServerWebSocketUrl: vi.fn(() => 'ws://localhost/lsp'),
}));

import {
  ProjectLanguageServerClient,
  projectLanguageServerModelUri,
} from '../src/language-server/project-language-server-client';

interface FakeMessageEvent {
  data: string;
}

class FakeWebSocket {
  public static readonly CONNECTING = 0;
  public static readonly OPEN = 1;
  public static readonly CLOSING = 2;
  public static readonly CLOSED = 3;

  public readyState = FakeWebSocket.CONNECTING;
  public readonly sent: string[] = [];
  private readonly listeners = new Map<string, Array<(event: never) => void>>();

  public constructor(public readonly url: string) {
    sockets.push(this);
  }

  public addEventListener(
    type: string,
    listener: (event: never) => void,
  ): void {
    const current = this.listeners.get(type) ?? [];
    current.push(listener);
    this.listeners.set(type, current);
  }

  public send(value: string): void {
    this.sent.push(value);
  }

  public close(): void {
    if (this.readyState === FakeWebSocket.CLOSED) return;
    this.readyState = FakeWebSocket.CLOSED;
    this.emit('close', {});
  }

  public open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.emit('open', {});
  }

  public receive(message: unknown): void {
    this.emit('message', {
      data: JSON.stringify(message),
    } satisfies FakeMessageEvent);
  }

  private emit(type: string, event: object): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event as never);
    }
  }
}

const sockets: FakeWebSocket[] = [];

function nextTick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function sentMessages(socket: FakeWebSocket): Array<Record<string, unknown>> {
  return socket.sent.map(
    (value) => JSON.parse(value) as Record<string, unknown>,
  );
}

function takeRequest(
  socket: FakeWebSocket,
  method: string,
): Record<string, unknown> {
  const message = sentMessages(socket).find(
    (candidate) => candidate.method === method && candidate.id !== undefined,
  );
  assert.ok(message, `requisição ${method} não enviada`);
  return message;
}

function fakeMonaco() {
  const providers: Array<{ dispose: ReturnType<typeof vi.fn> }> = [];
  const markerCalls: unknown[][] = [];
  const disposable = () => {
    const value = { dispose: vi.fn() };
    providers.push(value);
    return value;
  };
  return {
    providers,
    markerCalls,
    instance: {
      Uri: { parse: (value: string) => ({ toString: () => value }) },
      MarkerSeverity: { Hint: 1, Info: 2, Warning: 4, Error: 8 },
      MarkerTag: { Unnecessary: 1, Deprecated: 2 },
      editor: {
        setModelMarkers: (...args: unknown[]) => markerCalls.push(args),
      },
      languages: {
        CompletionItemKind: new Proxy(
          {},
          { get: (_target, key) => String(key) },
        ),
        SymbolKind: new Proxy({}, { get: (_target, key) => String(key) }),
        CompletionItemInsertTextRule: { InsertAsSnippet: 4 },
        registerHoverProvider: vi.fn(disposable),
        registerDefinitionProvider: vi.fn(disposable),
        registerReferenceProvider: vi.fn(disposable),
        registerCompletionItemProvider: vi.fn(disposable),
        registerDocumentSymbolProvider: vi.fn(disposable),
      },
    } as unknown as typeof Monaco,
  };
}

function fakeModel(uri: string, initialContent: string) {
  let content = initialContent;
  let listener: (() => void) | undefined;
  return {
    model: {
      uri: { toString: () => uri },
      getValue: () => content,
      getWordUntilPosition: () => ({ startColumn: 1, endColumn: 1, word: '' }),
      onDidChangeContent: (callback: () => void) => {
        listener = callback;
        return { dispose: vi.fn() };
      },
    } as unknown as Monaco.editor.ITextModel,
    change(value: string) {
      content = value;
      listener?.();
    },
  };
}

function openedTypeScript(
  content = 'export const value = 1;\n',
): ProjectFileContent {
  return {
    path: 'src/index.ts',
    name: 'index.ts',
    language: 'typescript',
    content,
    version: 'a'.repeat(64),
    size: content.length,
    modifiedAt: '2026-08-03T12:00:00.000Z',
    writable: true,
  };
}

function openedRuby(content = 'def value\n  1\nend\n'): ProjectFileContent {
  return {
    path: 'app/models/value.rb',
    name: 'value.rb',
    language: 'ruby',
    content,
    version: 'a'.repeat(64),
    size: content.length,
    modifiedAt: '2026-08-03T12:00:00.000Z',
    writable: true,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  sockets.length = 0;
  vi.stubGlobal('WebSocket', FakeWebSocket);
  api.status.mockResolvedValue({
    kind: 'javascript-typescript',
    supported: true,
    available: true,
    state: 'idle',
    activeConnections: 0,
    message: 'Disponível.',
  } satisfies ProjectLanguageServerStatus);
  api.file.mockResolvedValue(openedTypeScript());
  api.preview.mockResolvedValue({
    confirmationToken: 'c'.repeat(64),
    expiresAt: '2026-08-03T13:00:00.000Z',
    files: [
      {
        path: 'src/index.ts',
        language: 'typescript',
        beforeVersion: 'a'.repeat(64),
        beforeContent: 'export const value = 1;\n',
        afterContent: 'export const value = 2;\n',
      },
    ],
  } satisfies ProjectWorkspaceEditPreview);
});

test('gera a URI sintética vinculada ao projeto', () => {
  assert.equal(
    projectLanguageServerModelUri('project-1', 'src/my file.ts'),
    'file:///dev-dashboard/projects/project-1/src/my%20file.ts',
  );
});

test('inicializa, sincroniza mudanças e publica diagnósticos no Monaco', async () => {
  const monaco = fakeMonaco();
  const statuses: ProjectLanguageServerStatus[] = [];
  const diagnostics: string[] = [];
  const client = new ProjectLanguageServerClient(
    monaco.instance,
    'project-1',
    'Painel',
    'javascript-typescript',
    {
      onStatus: (status) => statuses.push(status),
      onDiagnostics: (message) => diagnostics.push(message),
      onWorkspaceEdit: vi.fn(),
      onError: vi.fn(),
    },
  );
  const file = openedTypeScript();
  const uri = projectLanguageServerModelUri('project-1', file.path);
  const model = fakeModel(uri, file.content);

  client.openFile(file, model.model);
  await nextTick();
  const socket = sockets[0];
  assert.ok(socket);
  socket.open();
  await nextTick();

  const initialize = takeRequest(socket, 'initialize');
  socket.receive({
    jsonrpc: '2.0',
    id: initialize.id,
    result: { capabilities: {} },
  });
  await nextTick();

  assert.ok(
    sentMessages(socket).some((message) => message.method === 'initialized'),
  );
  assert.ok(
    sentMessages(socket).some(
      (message) => message.method === 'textDocument/didOpen',
    ),
  );
  assert.equal(statuses.at(-1)?.state, 'ready');

  model.change('export const value = 2;\n');
  assert.ok(
    sentMessages(socket).some(
      (message) => message.method === 'textDocument/didChange',
    ),
  );

  socket.receive({
    jsonrpc: '2.0',
    method: 'textDocument/publishDiagnostics',
    params: {
      uri,
      diagnostics: [
        {
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 6 },
          },
          severity: 1,
          source: 'typescript',
          message: 'Erro de exemplo.',
        },
      ],
    },
  });
  await nextTick();

  assert.equal(monaco.markerCalls.length, 1);
  assert.match(diagnostics.at(-1) ?? '', /1 erro/);
  client.dispose();
});

test('busca símbolos e encaminha WorkspaceEdit apenas para revisão', async () => {
  const monaco = fakeMonaco();
  const previews: ProjectWorkspaceEditPreview[] = [];
  const client = new ProjectLanguageServerClient(
    monaco.instance,
    'project-1',
    'Painel',
    'javascript-typescript',
    {
      onStatus: vi.fn(),
      onDiagnostics: vi.fn(),
      onWorkspaceEdit: (preview) => previews.push(preview),
      onError: vi.fn(),
    },
  );
  const file = openedTypeScript();
  const uri = projectLanguageServerModelUri('project-1', file.path);
  const model = fakeModel(uri, file.content);

  client.openFile(file, model.model);
  await nextTick();
  const socket = sockets[0];
  assert.ok(socket);
  socket.open();
  await nextTick();
  const initialize = takeRequest(socket, 'initialize');
  socket.receive({
    jsonrpc: '2.0',
    id: initialize.id,
    result: { capabilities: {} },
  });
  await nextTick();

  const symbolsPromise = client.workspaceSymbols('value');
  const symbolsRequest = takeRequest(socket, 'workspace/symbol');
  socket.receive({
    jsonrpc: '2.0',
    id: symbolsRequest.id,
    result: [
      {
        name: 'value',
        kind: 13,
        location: {
          uri,
          range: {
            start: { line: 0, character: 13 },
            end: { line: 0, character: 18 },
          },
        },
      },
    ],
  });
  const symbols = await symbolsPromise;
  assert.deepEqual(symbols, [
    {
      path: 'src/index.ts',
      name: 'index.ts',
      language: 'typescript',
      line: 1,
      column: 14,
      preview: 'value',
    },
  ]);

  socket.receive({
    jsonrpc: '2.0',
    id: 99,
    method: 'workspace/applyEdit',
    params: {
      edit: {
        changes: {
          [uri]: [
            {
              range: {
                start: { line: 0, character: 21 },
                end: { line: 0, character: 22 },
              },
              newText: '2',
            },
          ],
        },
      },
    },
  });
  await nextTick();
  await nextTick();

  assert.equal(api.preview.mock.calls.length, 1);
  assert.equal(previews.length, 1);
  const applyResponse = sentMessages(socket).find(
    (message) => message.id === 99,
  );
  assert.deepEqual(applyResponse, {
    jsonrpc: '2.0',
    id: 99,
    result: {
      applied: false,
      failureReason:
        'A alteração foi encaminhada para revisão segura no dashboard.',
    },
  });
  client.dispose();
});

test('sessão ruby não envia preferências específicas de TypeScript e registra o kind correto', async () => {
  const monaco = fakeMonaco();
  const statuses: ProjectLanguageServerStatus[] = [];
  api.status.mockResolvedValue({
    kind: 'ruby',
    supported: true,
    available: true,
    state: 'idle',
    activeConnections: 0,
    message: 'Disponível.',
  } satisfies ProjectLanguageServerStatus);
  api.file.mockResolvedValue(openedRuby());

  const client = new ProjectLanguageServerClient(
    monaco.instance,
    'project-1',
    'Painel',
    'ruby',
    {
      onStatus: (status) => statuses.push(status),
      onDiagnostics: vi.fn(),
      onWorkspaceEdit: vi.fn(),
      onError: vi.fn(),
    },
  );
  const file = openedRuby();
  const uri = projectLanguageServerModelUri('project-1', file.path);
  const model = fakeModel(uri, file.content);

  client.openFile(file, model.model);
  await nextTick();
  const socket = sockets[0];
  assert.ok(socket);
  socket.open();
  await nextTick();

  const initialize = takeRequest(socket, 'initialize');
  assert.equal(initialize.initializationOptions, undefined);
  socket.receive({
    jsonrpc: '2.0',
    id: initialize.id,
    result: { capabilities: {} },
  });
  await nextTick();

  assert.equal(statuses.at(-1)?.kind, 'ruby');
  assert.equal(statuses.at(-1)?.state, 'ready');
  assert.ok(
    monaco.instance.languages.registerHoverProvider &&
      (
        monaco.instance.languages
          .registerHoverProvider as unknown as ReturnType<typeof vi.fn>
      ).mock.calls.some((call: unknown[]) => call[0] === 'ruby'),
  );
  client.dispose();
});
