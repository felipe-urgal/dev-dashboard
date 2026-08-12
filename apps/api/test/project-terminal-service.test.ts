import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

import { ProjectTerminalService } from '../src/services/project-terminal-service.js';

class FakePty extends EventEmitter {
  public readonly writes: string[] = [];
  public readonly resizes: Array<{ cols: number; rows: number }> = [];
  public killed = false;
  private dataListener: ((data: string) => void) | undefined;
  private exitListener:
    ((event: { exitCode: number; signal?: number }) => void) | undefined;

  public onData(listener: (data: string) => void): { dispose(): void } {
    this.dataListener = listener;
    return { dispose: () => (this.dataListener = undefined) };
  }

  public onExit(
    listener: (event: { exitCode: number; signal?: number }) => void,
  ): { dispose(): void } {
    this.exitListener = listener;
    return { dispose: () => (this.exitListener = undefined) };
  }

  public write(data: string): void {
    this.writes.push(data);
  }

  public resize(cols: number, rows: number): void {
    this.resizes.push({ cols, rows });
  }

  public kill(): void {
    if (this.killed) return;
    this.killed = true;
    this.emitExit(0);
  }

  public emitData(data: string): void {
    this.dataListener?.(data);
  }

  public emitExit(exitCode: number): void {
    this.exitListener?.({ exitCode });
  }
}

class FakeSocket extends EventEmitter {
  public readonly OPEN = 1;
  public readyState = 1;
  public readonly sent: unknown[] = [];
  public closeCode?: number;

  public send(value: string): void {
    this.sent.push(JSON.parse(value));
  }

  public close(code?: number): void {
    if (this.readyState === 3) return;
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
    type: 'rails',
    source: 'workspace',
    enabled: true,
    capabilities: [],
    ...overrides,
  };
}

test('status: shell sempre suportado, console só para Rails', async () => {
  const service = new ProjectTerminalService();
  const nodeProject = project('/tmp/x', { type: 'node' });

  assert.equal(service.status(nodeProject, 'shell').supported, true);
  assert.equal(service.status(nodeProject, 'rails-console').supported, false);
  assert.equal(
    service.status(project('/tmp/x'), 'rails-console').supported,
    true,
  );
});

test('attach recusa conexão sem confirmação válida', async () => {
  const service = new ProjectTerminalService();
  const socket = new FakeSocket();
  await service.attach(project('/tmp/x'), 'shell', undefined, socket as never);
  assert.equal(socket.closeCode, 1008);
  assert.deepEqual(socket.sent[0], {
    type: 'error',
    message: 'Confirmação ausente, inválida ou expirada.',
  });
});

test('attach recusa token de outro projeto ou kind', async () => {
  const service = new ProjectTerminalService();
  const confirmation = service.prepareConfirmation(project('/tmp/x'), 'shell');
  const socket = new FakeSocket();
  await service.attach(
    project('/tmp/x', { id: 'other-project' }),
    'shell',
    confirmation.token,
    socket as never,
  );
  assert.equal(socket.closeCode, 1008);
});

test('attach recusa console para projeto não-Rails', async () => {
  const service = new ProjectTerminalService();
  const nodeProject = project('/tmp/x', { type: 'node' });
  const confirmation = service.prepareConfirmation(
    nodeProject,
    'rails-console',
  );
  const socket = new FakeSocket();
  await service.attach(
    nodeProject,
    'rails-console',
    confirmation.token,
    socket as never,
  );
  assert.equal(socket.closeCode, 1000);
});

test('fluxo completo: conecta, troca input/output, redimensiona e encerra', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dev-dashboard-terminal-'));
  try {
    let spawnedFile: string | undefined;
    let spawnedArgs: readonly string[] | undefined;
    const fakePty = new FakePty();
    const service = new ProjectTerminalService({
      spawnPty: (file, args) => {
        spawnedFile = file;
        spawnedArgs = args;
        return fakePty as never;
      },
      resolveCommand: async () => ({ file: '/bin/bash', args: [] }),
    });

    const testProject = project(root);
    const confirmation = service.prepareConfirmation(testProject, 'shell');
    const socket = new FakeSocket();

    await service.attach(
      testProject,
      'shell',
      confirmation.token,
      socket as never,
    );
    assert.equal(spawnedFile, '/bin/bash');
    assert.deepEqual(spawnedArgs, []);
    assert.deepEqual(socket.sent[0], { type: 'ready' });
    assert.equal(service.status(testProject, 'shell').activeSessions, 1);

    fakePty.emitData('$ ');
    assert.deepEqual(socket.sent.at(-1), { type: 'output', data: '$ ' });

    socket.clientMessage({ type: 'input', data: 'ls\n' });
    assert.deepEqual(fakePty.writes, ['ls\n']);

    socket.clientMessage({ type: 'resize', cols: 120, rows: 40 });
    assert.deepEqual(fakePty.resizes, [{ cols: 120, rows: 40 }]);

    socket.clientMessage({ type: 'resize', cols: 999_999, rows: -5 });
    assert.deepEqual(fakePty.resizes.at(-1), { cols: 500, rows: 1 });

    fakePty.emitExit(0);
    assert.deepEqual(socket.sent.at(-1), { type: 'exit', code: 0 });
    assert.equal(service.status(testProject, 'shell').activeSessions, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('confirmação é de uso único e expira', async () => {
  let now = 0;
  const service = new ProjectTerminalService({ now: () => now });
  const testProject = project('/tmp/x');
  const confirmation = service.prepareConfirmation(testProject, 'shell');

  now = 61_000;
  const expiredSocket = new FakeSocket();
  await service.attach(
    testProject,
    'shell',
    confirmation.token,
    expiredSocket as never,
  );
  assert.equal(expiredSocket.closeCode, 1008);

  now = 0;
  const secondConfirmation = service.prepareConfirmation(testProject, 'shell');
  const fakePty = new FakePty();
  const service2 = new ProjectTerminalService({
    spawnPty: () => fakePty as never,
    resolveCommand: async () => ({ file: '/bin/bash', args: [] }),
  });
  const reused = service2.prepareConfirmation(testProject, 'shell');
  const firstSocket = new FakeSocket();
  await service2.attach(
    testProject,
    'shell',
    reused.token,
    firstSocket as never,
  );
  assert.notEqual(firstSocket.closeCode, 1008);

  const secondSocket = new FakeSocket();
  await service2.attach(
    testProject,
    'shell',
    reused.token,
    secondSocket as never,
  );
  assert.equal(secondSocket.closeCode, 1008);
  void secondConfirmation;
});

test('desconexão do navegador encerra o processo', async () => {
  const fakePty = new FakePty();
  const service = new ProjectTerminalService({
    spawnPty: () => fakePty as never,
    resolveCommand: async () => ({ file: '/bin/bash', args: [] }),
  });
  const testProject = project('/tmp/x');
  const confirmation = service.prepareConfirmation(testProject, 'shell');
  const socket = new FakeSocket();
  await service.attach(
    testProject,
    'shell',
    confirmation.token,
    socket as never,
  );

  socket.close();
  assert.equal(fakePty.killed, true);
  assert.equal(service.status(testProject, 'shell').activeSessions, 0);
});

test('comando indisponível encerra a conexão com erro', async () => {
  const service = new ProjectTerminalService({
    resolveCommand: async () => undefined,
  });
  const testProject = project('/tmp/x');
  const confirmation = service.prepareConfirmation(
    testProject,
    'rails-console',
  );
  const socket = new FakeSocket();
  await service.attach(
    testProject,
    'rails-console',
    confirmation.token,
    socket as never,
  );
  assert.equal(socket.closeCode, 1011);
});
