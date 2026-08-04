import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';

import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import type { Project } from '@dev-dashboard/contracts';
import type { RawData, WebSocket } from 'ws';

import {
  LspMessageDecoder,
  ProjectLanguageServerService,
  clientUriToServerUri,
  encodeLspMessage,
  gemfileLockHasGem,
  serverUriToClientUri,
  translateServerMessage,
} from '../src/services/project-language-server-service.js';

class FakeChild extends EventEmitter {
  public readonly stdin = new PassThrough();
  public readonly stdout = new PassThrough();
  public readonly stderr = new PassThrough();
  public exitCode: number | null = null;
  public readonly signals: NodeJS.Signals[] = [];

  public kill(signal: NodeJS.Signals = 'SIGTERM'): boolean {
    this.signals.push(signal);
    if (this.exitCode === null) {
      this.exitCode = 0;
      this.emit('exit', 0, signal);
    }
    return true;
  }
}

class FakeSocket extends EventEmitter {
  public readonly OPEN = 1;
  public readyState = 1;
  public readonly sent: string[] = [];
  public closeCode?: number;

  public send(value: string): void {
    this.sent.push(value);
  }

  public close(code?: number): void {
    this.closeCode = code;
    this.readyState = 3;
    this.emit('close');
  }

  public clientMessage(message: unknown): void {
    this.emit('message', Buffer.from(JSON.stringify(message)), false);
  }
}

function project(root: string, overrides: Partial<Project> = {}): Project {
  return {
    id: 'project-1',
    name: 'Painel',
    path: root,
    type: 'node',
    source: 'workspace',
    favorite: false,
    capabilities: [],
    ...overrides,
  };
}

test('decodifica frames LSP fragmentados e preserva mensagens em sequência', () => {
  const decoder = new LspMessageDecoder();
  const first = encodeLspMessage({ jsonrpc: '2.0', id: 1, result: true });
  const second = encodeLspMessage({ jsonrpc: '2.0', method: 'initialized' });
  assert.deepEqual(decoder.push(first.subarray(0, 10)), []);
  assert.deepEqual(
    decoder.push(Buffer.concat([first.subarray(10), second])),
    [
      { jsonrpc: '2.0', id: 1, result: true },
      { jsonrpc: '2.0', method: 'initialized' },
    ],
  );
});

test('traduz somente URIs do projeto autorizado', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dev-dashboard-lsp-uri-'));
  try {
    const clientUri =
      'file:///dev-dashboard/projects/project-1/src/index.ts';
    const serverUri = clientUriToServerUri('project-1', root, clientUri);
    assert.match(serverUri, /src\/index\.ts$/);
    assert.equal(
      serverUriToClientUri('project-1', root, serverUri),
      clientUri,
    );
    assert.equal(
      serverUriToClientUri(
        'project-1',
        root,
        new URL('file:///tmp/outside.ts').href,
      ),
      undefined,
    );
    assert.throws(
      () => clientUriToServerUri(
        'project-1',
        root,
        'file:///dev-dashboard/projects/other/src/index.ts',
      ),
      /fora do projeto autorizado/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('remove localizações externas antes de devolver uma resposta ao navegador', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dev-dashboard-lsp-filter-'));
  try {
    const result = translateServerMessage(project(root), root, {
      jsonrpc: '2.0',
      id: 1,
      result: [
        {
          uri: new URL(`file://${path.join(root, 'src', 'ok.ts')}`).href,
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 1 },
          },
        },
        {
          uri: 'file:///tmp/outside.ts',
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 1 },
          },
        },
      ],
    });
    assert.deepEqual(result, {
      jsonrpc: '2.0',
      id: 1,
      result: [{
        uri: 'file:///dev-dashboard/projects/project-1/src/ok.ts',
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 1 },
        },
      }],
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('inicia sob demanda, bloqueia executeCommand e encerra após inatividade', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dev-dashboard-lsp-life-'));
  const child = new FakeChild();
  const writes: Buffer[] = [];
  child.stdin.on('data', (chunk: Buffer) => writes.push(chunk));
  const service = new ProjectLanguageServerService({
    idleTimeoutMs: 5,
    findCommand: async () => ({
      executable: '/usr/bin/typescript-language-server',
      args: ['--stdio'],
      usesRailsRuntime: false,
    }),
    spawnProcess: () => child as unknown as ChildProcessWithoutNullStreams,
  });
  const socket = new FakeSocket();

  try {
    await service.attach(
      project(root),
      'javascript-typescript',
      socket as unknown as WebSocket,
    );
    assert.equal(socket.closeCode, undefined);
    assert.match(socket.sent[0] ?? '', /languageServerStatus/);

    socket.clientMessage({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        rootUri: 'file:///dev-dashboard/projects/project-1',
      },
    });
    await new Promise((resolve) => setImmediate(resolve));
    const decoder = new LspMessageDecoder();
    const forwarded = decoder.push(Buffer.concat(writes));
    assert.equal((forwarded[0] as { method: string }).method, 'initialize');
    assert.match(
      (forwarded[0] as { params: { rootUri: string } }).params.rootUri,
      /^file:/,
    );

    const beforeBlocked = writes.length;
    socket.clientMessage({
      jsonrpc: '2.0',
      id: 2,
      method: 'workspace/executeCommand',
      params: { command: 'typescript.organizeImports' },
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(writes.length, beforeBlocked);
    assert.match(socket.sent.at(-1) ?? '', /permanece bloqueado/);

    child.stdout.write(encodeLspMessage({
      jsonrpc: '2.0',
      id: 1,
      result: {
        definitionProvider: true,
        root: new URL(`file://${root}`).href,
      },
    }));
    await new Promise((resolve) => setImmediate(resolve));
    assert.match(socket.sent.at(-1) ?? '', /dev-dashboard\/projects\/project-1/);

    socket.close(1000);
    await new Promise((resolve) => setTimeout(resolve, 15));
    assert.ok(child.signals.includes('SIGTERM'));
  } finally {
    service.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('informa indisponibilidade sem instalar ferramentas', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dev-dashboard-lsp-missing-'));
  try {
    const service = new ProjectLanguageServerService({
      findCommand: async () => undefined,
    });
    const status = await service.status(project(root), 'javascript-typescript');
    assert.equal(status.supported, true);
    assert.equal(status.available, false);
    assert.equal(status.state, 'unavailable');
    assert.match(status.message, /Instale-o manualmente/);
    service.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('sessões Ruby e JavaScript/TypeScript têm lifecycle independente', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dev-dashboard-lsp-multi-'));
  await writeFile(path.join(root, 'Gemfile'), 'source "https://rubygems.org"\n');
  const jsChild = new FakeChild();
  const rubyChild = new FakeChild();
  const service = new ProjectLanguageServerService({
    findCommand: async (_project, _root, kind) =>
      kind === 'javascript-typescript'
        ? { executable: '/usr/bin/typescript-language-server', args: ['--stdio'], usesRailsRuntime: false }
        : { executable: '/usr/bin/ruby-lsp', args: ['--stdio'], usesRailsRuntime: false },
    spawnProcess: (executable) =>
      (executable.includes('ruby-lsp') ? rubyChild : jsChild) as unknown as ChildProcessWithoutNullStreams,
  });
  const jsSocket = new FakeSocket();
  const rubySocket = new FakeSocket();

  try {
    await service.attach(project(root), 'javascript-typescript', jsSocket as unknown as WebSocket);
    await service.attach(project(root), 'ruby', rubySocket as unknown as WebSocket);
    assert.equal(jsSocket.closeCode, undefined);
    assert.equal(rubySocket.closeCode, undefined);

    jsChild.kill('SIGTERM');
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(rubySocket.closeCode, undefined);
    assert.ok(!rubyChild.signals.includes('SIGTERM'));
  } finally {
    service.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('checagem de Gemfile.lock não executa bundler', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dev-dashboard-lsp-lock-'));
  try {
    assert.equal(await gemfileLockHasGem(root, 'ruby-lsp'), false);
    await writeFile(
      path.join(root, 'Gemfile.lock'),
      'GEM\n  remote: https://rubygems.org/\n  specs:\n    ruby-lsp (0.20.0)\n      language_server-protocol\n\nPLATFORMS\n  ruby\n',
    );
    assert.equal(await gemfileLockHasGem(root, 'ruby-lsp'), true);
    assert.equal(await gemfileLockHasGem(root, 'ruby-lsp-rails'), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('não inicia bundle exec com add-on Rails presente sem opt-in explícito', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dev-dashboard-lsp-rails-gate-'));
  await writeFile(
    path.join(root, 'Gemfile.lock'),
    'GEM\n  remote: https://rubygems.org/\n  specs:\n    ruby-lsp (0.20.0)\n    ruby-lsp-rails (0.3.0)\n\nPLATFORMS\n  ruby\n',
  );
  try {
    const { findRubyLanguageServer } = await import(
      '../src/services/project-language-server-service.js'
    );
    const withoutRuntime = await findRubyLanguageServer(root, false);
    assert.ok(
      withoutRuntime === undefined || !withoutRuntime.usesRailsRuntime,
      'não deve carregar o add-on Rails sem habilitação explícita',
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('opt-in de Rails runtime exige confirmação válida e pode ser desabilitado sem token', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dev-dashboard-lsp-rails-opt-'));
  await writeFile(
    path.join(root, 'Gemfile.lock'),
    'GEM\n  remote: https://rubygems.org/\n  specs:\n    ruby-lsp (0.20.0)\n    ruby-lsp-rails (0.3.0)\n\nPLATFORMS\n  ruby\n',
  );
  try {
    const service = new ProjectLanguageServerService();
    const railsProject = project(root, { type: 'rails' });

    await assert.rejects(
      () => service.setRailsRuntimeEnabled(railsProject, true, 'invalid-token'),
      /ausente, inválida ou expirada/,
    );

    const confirmation = await service.prepareRailsRuntimeConfirmation(railsProject);
    const enabledStatus = await service.setRailsRuntimeEnabled(
      railsProject,
      true,
      confirmation.token,
    );
    assert.equal(enabledStatus.rails?.runtimeState, 'enabled');

    const disabledStatus = await service.setRailsRuntimeEnabled(railsProject, false, undefined);
    assert.equal(disabledStatus.rails?.runtimeState, 'disabled');
    service.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('reconhece sinais Rails/Ruby: Gemfile, .ruby-version e tipo do projeto', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dev-dashboard-lsp-signals-'));
  try {
    const service = new ProjectLanguageServerService({
      findCommand: async () => undefined,
    });
    const withoutSignals = await service.status(project(root), 'ruby');
    assert.equal(withoutSignals.supported, false);

    await writeFile(path.join(root, '.ruby-version'), '3.3.0\n');
    const withRubyVersion = await service.status(project(root), 'ruby');
    assert.equal(withRubyVersion.supported, true);
    service.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
