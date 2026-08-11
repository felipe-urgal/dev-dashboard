import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

import { DetachableExecutionService } from '../src/services/detachable-execution-service.js';
import {
  ProjectTestPtyError,
  ProjectTestPtyService,
} from '../src/services/project-test-pty-service.js';

class FakePty extends EventEmitter {
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

  public write(): void {}
  public resize(): void {}
  public kill(): void {}

  public emitData(data: string): void {
    this.dataListener?.(data);
  }

  public emitExit(exitCode: number, signal?: number): void {
    this.exitListener?.({ exitCode, signal });
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
}

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: 'projeto-1',
    name: 'Projeto',
    path: '/tmp/projeto-1',
    type: 'node',
    source: 'workspace',
    favorite: false,
    enabled: true,
    capabilities: [],
    ...overrides,
  };
}

function stubDetection(resolved: { command: string; args: string[] } | null) {
  return {
    resolveCommand: async () => resolved,
  } as never;
}

test('start() resolve o comando via testDetectionService e spawna via DetachableExecutionService', async () => {
  const fakePty = new FakePty();
  let spawnedFile: string | undefined;
  let spawnedArgs: readonly string[] | undefined;
  const detachable = new DetachableExecutionService({
    spawnPty: (file, args) => {
      spawnedFile = file;
      spawnedArgs = args;
      return fakePty as never;
    },
  });
  const service = new ProjectTestPtyService(
    detachable,
    stubDetection({ command: 'npm', args: ['test'] }),
  );

  const snapshot = await service.start(project(), 'full-suite');

  assert.equal(spawnedFile, 'npm');
  assert.deepEqual(spawnedArgs, ['test']);
  assert.equal(snapshot.status, 'running');
});

test('start() lança TEST_COMMAND_NOT_FOUND quando o comando não existe', async () => {
  const detachable = new DetachableExecutionService();
  const service = new ProjectTestPtyService(detachable, stubDetection(null));

  await assert.rejects(
    () => service.start(project(), 'inexistente'),
    (error: unknown) =>
      error instanceof ProjectTestPtyError &&
      error.code === 'TEST_COMMAND_NOT_FOUND',
  );
});

test('start() traduz falha de spawn (ex. comando não encontrado) em START_FAILED com a causa real', async () => {
  const detachable = new DetachableExecutionService({
    spawnPty: () => {
      throw new Error('spawn npm ENOENT');
    },
  });
  const service = new ProjectTestPtyService(
    detachable,
    stubDetection({ command: 'npm', args: ['test'] }),
  );

  await assert.rejects(
    () => service.start(project(), 'full-suite'),
    (error: unknown) =>
      error instanceof ProjectTestPtyError &&
      error.code === 'START_FAILED' &&
      error.message.includes('spawn npm ENOENT') &&
      error.message.includes('npm test'),
  );
});

test('start() traduz falha na resolução do comando em START_FAILED', async () => {
  const detachable = new DetachableExecutionService();
  const failingDetection = {
    resolveCommand: async () => {
      throw new Error('EACCES: permission denied');
    },
  } as never;
  const service = new ProjectTestPtyService(detachable, failingDetection);

  await assert.rejects(
    () => service.start(project(), 'full-suite'),
    (error: unknown) =>
      error instanceof ProjectTestPtyError &&
      error.code === 'START_FAILED' &&
      error.message.includes('EACCES'),
  );
});

test('start() lança ALREADY_RUNNING numa segunda chamada enquanto a primeira roda', async () => {
  const fakePty = new FakePty();
  const detachable = new DetachableExecutionService({
    spawnPty: () => fakePty as never,
  });
  const service = new ProjectTestPtyService(
    detachable,
    stubDetection({ command: 'npm', args: ['test'] }),
  );

  await service.start(project(), 'full-suite');

  await assert.rejects(
    () => service.start(project(), 'full-suite'),
    (error: unknown) =>
      error instanceof ProjectTestPtyError && error.code === 'ALREADY_RUNNING',
  );
});

test('attach() envia ready com o snapshot, encaminha output e exit, e detach não mata o processo', async () => {
  const fakePty = new FakePty();
  const detachable = new DetachableExecutionService({
    spawnPty: () => fakePty as never,
  });
  const service = new ProjectTestPtyService(
    detachable,
    stubDetection({ command: 'npm', args: ['test'] }),
  );

  await service.start(project(), 'full-suite');

  const socket = new FakeSocket();
  service.attach(project(), socket as never);

  assert.equal((socket.sent[0] as { type: string }).type, 'ready');

  fakePty.emitData('rodando...\n');
  assert.deepEqual(socket.sent.at(-1), {
    type: 'output',
    data: 'rodando...\n',
  });

  socket.close();
  assert.equal(
    detachable.isRunning('projeto-1:test-pty'),
    true,
    'fechar o socket não deveria matar a execução',
  );

  fakePty.emitExit(0);
  assert.equal(detachable.snapshotOf('projeto-1:test-pty')?.status, 'exited');
});

test('attach() sem execução em andamento envia erro e fecha o socket', () => {
  const detachable = new DetachableExecutionService();
  const service = new ProjectTestPtyService(detachable, stubDetection(null));

  const socket = new FakeSocket();
  service.attach(project(), socket as never);

  assert.equal(socket.closeCode, 1000);
  assert.equal((socket.sent[0] as { type: string }).type, 'error');
});

test('cancel() delega para DetachableExecutionService.cancel()', async () => {
  const fakePty = new FakePty();
  const kills: string[] = [];
  fakePty.kill = (signal?: string) => {
    kills.push(signal ?? 'default');
  };
  const detachable = new DetachableExecutionService({
    spawnPty: () => fakePty as never,
  });
  const service = new ProjectTestPtyService(
    detachable,
    stubDetection({ command: 'npm', args: ['test'] }),
  );

  await service.start(project(), 'full-suite');
  service.cancel(project());

  assert.deepEqual(kills, ['SIGTERM']);
});
