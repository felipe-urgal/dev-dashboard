import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import {
  DetachableExecutionError,
  DetachableExecutionService,
} from '../src/services/detachable-execution-service.js';

class FakePty extends EventEmitter {
  public readonly kills: string[] = [];
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

  public write(): void {
    throw new Error('execuções destacáveis não aceitam stdin');
  }

  public resize(): void {
    // não usado por execuções não interativas
  }

  public kill(signal?: string): void {
    this.kills.push(signal ?? 'default');
  }

  public emitData(data: string): void {
    this.dataListener?.(data);
  }

  public emitExit(exitCode: number, signal?: number): void {
    this.exitListener?.({ exitCode, signal });
  }
}

function createService(fakePty: FakePty) {
  return new DetachableExecutionService({
    spawnPty: () => fakePty as never,
  });
}

test('a saída passa pela mesma máscara de segredos usada em toda leitura de log', () => {
  const fakePty = new FakePty();
  const service = createService(fakePty);

  service.start('projeto-1:test', { file: 'npm', args: ['test'], cwd: '/tmp' });

  const received: string[] = [];
  service.attach(
    'projeto-1:test',
    (chunk) => received.push(chunk),
    () => undefined,
  );

  fakePty.emitData('DATABASE_URL=postgres://user:s3cr3t@host/db\n');

  assert.equal(received.length, 1);
  assert.doesNotMatch(received[0]!, /s3cr3t/);

  const snapshot = service.snapshotOf('projeto-1:test');
  assert.doesNotMatch(snapshot?.buffer ?? '', /s3cr3t/);
});

test('start() spawna o processo e attach() recebe dados ao vivo', () => {
  const fakePty = new FakePty();
  const service = createService(fakePty);

  service.start('projeto-1:test', { file: 'npm', args: ['test'], cwd: '/tmp' });

  const received: string[] = [];
  service.attach(
    'projeto-1:test',
    (chunk) => received.push(chunk),
    () => undefined,
  );

  fakePty.emitData('linha 1\n');
  fakePty.emitData('linha 2\n');

  assert.deepEqual(received, ['linha 1\n', 'linha 2\n']);
});

test('detach() não mata o processo — reconectar reanexa e recebe o buffer acumulado mais o que vier depois', () => {
  const fakePty = new FakePty();
  const service = createService(fakePty);

  service.start('projeto-1:test', { file: 'npm', args: ['test'], cwd: '/tmp' });

  const firstReceived: string[] = [];
  const first = service.attach(
    'projeto-1:test',
    (chunk) => firstReceived.push(chunk),
    () => undefined,
  );

  fakePty.emitData('antes de desconectar\n');
  first.detach();

  assert.equal(fakePty.kills.length, 0, 'detach não deveria matar o processo');
  assert.equal(
    service.isRunning('projeto-1:test'),
    true,
    'o processo continua rodando sem ninguém conectado',
  );

  // Mais saída acontece enquanto ninguém está conectado.
  fakePty.emitData('enquanto ninguém olhava\n');

  const secondReceived: string[] = [];
  const second = service.attach(
    'projeto-1:test',
    (chunk) => secondReceived.push(chunk),
    () => undefined,
  );

  assert.equal(
    second.snapshot.buffer,
    'antes de desconectar\nenquanto ninguém olhava\n',
    'a reconexão recebe o buffer acumulado, inclusive o que rolou sem observador',
  );

  fakePty.emitData('depois de reconectar\n');
  assert.deepEqual(secondReceived, ['depois de reconectar\n']);
});

test('exit code e sinal continuam disponíveis para quem reanexa depois do processo terminar', () => {
  const fakePty = new FakePty();
  const service = createService(fakePty);

  service.start('projeto-1:migration', {
    file: 'bin/rails',
    args: ['db:migrate'],
    cwd: '/tmp',
  });

  const handle = service.attach(
    'projeto-1:migration',
    () => undefined,
    () => undefined,
  );
  fakePty.emitData('rodando migration\n');
  handle.detach();

  fakePty.emitExit(1, 15);

  assert.equal(service.isRunning('projeto-1:migration'), false);

  const late = service.attach(
    'projeto-1:migration',
    () => undefined,
    () => undefined,
  );
  assert.equal(late.snapshot.status, 'exited');
  assert.equal(late.snapshot.exitCode, 1);
  assert.equal(late.snapshot.exitSignal, 15);
  assert.equal(late.snapshot.buffer, 'rodando migration\n');
});

test('onExit é chamado para quem está conectado no momento em que o processo termina', () => {
  const fakePty = new FakePty();
  const service = createService(fakePty);

  service.start('projeto-1:build', {
    file: 'npm',
    args: ['run', 'build'],
    cwd: '/tmp',
  });

  let exitSnapshot: ReturnType<typeof service.snapshotOf>;
  service.attach(
    'projeto-1:build',
    () => undefined,
    (snapshot) => {
      exitSnapshot = snapshot;
    },
  );

  fakePty.emitExit(0);

  assert.equal(exitSnapshot?.status, 'exited');
  assert.equal(exitSnapshot?.exitCode, 0);
});

test('o buffer respeita o teto configurado, preservando o final da saída', () => {
  const fakePty = new FakePty();
  const service = new DetachableExecutionService({
    spawnPty: () => fakePty as never,
    bufferLimitBytes: 10,
  });

  service.start('projeto-1:test', { file: 'npm', args: ['test'], cwd: '/tmp' });
  fakePty.emitData('0123456789');
  fakePty.emitData('abcdefghij');

  const snapshot = service.snapshotOf('projeto-1:test');
  assert.equal(snapshot?.buffer, 'abcdefghij');
  assert.equal(snapshot?.truncated, true);
});

test('o buffer não corta caracteres UTF-8 no meio ao atingir o teto', () => {
  const fakePty = new FakePty();
  const service = new DetachableExecutionService({
    spawnPty: () => fakePty as never,
    bufferLimitBytes: 5,
  });

  service.start('projeto-1:test', { file: 'npm', args: ['test'], cwd: '/tmp' });
  fakePty.emitData('😀ab');

  const snapshot = service.snapshotOf('projeto-1:test');
  assert.equal(snapshot?.buffer, 'ab');
  assert.equal(snapshot?.truncated, true);
  assert.ok(Buffer.byteLength(snapshot?.buffer ?? '', 'utf8') <= 5);
  assert.doesNotMatch(snapshot?.buffer ?? '', /�/);
});

test('cancel() manda TERM e escalona para KILL se o processo não sair a tempo', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const fakePty = new FakePty();
  const service = createService(fakePty);

  service.start('projeto-1:test', { file: 'npm', args: ['test'], cwd: '/tmp' });
  service.cancel('projeto-1:test');

  assert.deepEqual(fakePty.kills, ['SIGTERM']);

  t.mock.timers.tick(1_000);
  assert.deepEqual(fakePty.kills, ['SIGTERM', 'SIGKILL']);
});

test('cancel() não escalona se o processo já saiu depois do TERM', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const fakePty = new FakePty();
  const service = createService(fakePty);

  service.start('projeto-1:test', { file: 'npm', args: ['test'], cwd: '/tmp' });
  service.cancel('projeto-1:test');
  fakePty.emitExit(0, 15);

  t.mock.timers.tick(1_000);
  assert.deepEqual(fakePty.kills, ['SIGTERM']);
});

test('start() rejeita uma segunda execução na mesma chave enquanto a primeira roda', () => {
  const fakePty = new FakePty();
  const service = createService(fakePty);

  service.start('projeto-1:test', { file: 'npm', args: ['test'], cwd: '/tmp' });

  assert.throws(
    () =>
      service.start('projeto-1:test', {
        file: 'npm',
        args: ['test'],
        cwd: '/tmp',
      }),
    (error: unknown) =>
      error instanceof DetachableExecutionError &&
      error.code === 'ALREADY_RUNNING',
  );
});

test('attach() numa chave desconhecida lança NOT_FOUND', () => {
  const service = new DetachableExecutionService();

  assert.throws(
    () =>
      service.attach(
        'inexistente',
        () => undefined,
        () => undefined,
      ),
    (error: unknown) =>
      error instanceof DetachableExecutionError && error.code === 'NOT_FOUND',
  );
});

test('remove() libera a entrada só depois que a execução termina', () => {
  const fakePty = new FakePty();
  const service = createService(fakePty);

  service.start('projeto-1:test', { file: 'npm', args: ['test'], cwd: '/tmp' });
  service.remove('projeto-1:test');
  assert.equal(
    service.isRunning('projeto-1:test'),
    true,
    'remove não deveria afetar uma execução ainda rodando',
  );

  fakePty.emitExit(0);
  service.remove('projeto-1:test');
  assert.equal(service.snapshotOf('projeto-1:test'), undefined);
});
