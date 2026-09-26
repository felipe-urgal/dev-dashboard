import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { DashboardTerminalService } from '../src/services/dashboard-terminal-service.js';

class FakePty {
  public readonly writes: string[] = [];
  public readonly resizes: Array<{ cols: number; rows: number }> = [];
  public killed = false;
  private dataListener: ((data: string) => void) | undefined;
  private exitListener:
    | ((event: { exitCode: number; signal?: number }) => void)
    | undefined;

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
    this.killed = true;
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

test('modo terminal inicia dev-tools com comando fixo na raiz do dashboard', async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), 'dev-dashboard-global-terminal-'),
  );
  await writeFile(path.join(root, 'init.sh'), '# test\n');

  try {
    let spawnedFile = '';
    let spawnedArgs: readonly string[] = [];
    let spawnedCwd = '';
    const fakePty = new FakePty();
    const service = new DashboardTerminalService({
      dashboardRoot: root,
      spawnPty: (file, args, options) => {
        spawnedFile = file;
        spawnedArgs = args;
        spawnedCwd = options.cwd ?? '';
        return fakePty as never;
      },
    });
    const confirmation = service.prepareConfirmation();
    const socket = new FakeSocket();

    await service.attach(confirmation.token, socket as never);

    assert.equal(spawnedFile, '/bin/bash');
    assert.equal(spawnedCwd, root);
    assert.deepEqual(spawnedArgs, [
      '--noprofile',
      '--norc',
      '-c',
      'unset DEV_LOADED; export DEV_SILENT=1; source "$1/init.sh" && dev-tools',
      'dev-dashboard',
      root,
    ]);
    assert.deepEqual(socket.sent[0], { type: 'ready' });

    fakePty.emitData('Dev Dashboard');
    assert.deepEqual(socket.sent.at(-1), {
      type: 'output',
      data: 'Dev Dashboard',
    });

    socket.clientMessage({ type: 'input', data: '\n' });
    assert.deepEqual(fakePty.writes, ['\n']);

    socket.clientMessage({ type: 'resize', cols: 120, rows: 40 });
    assert.deepEqual(fakePty.resizes, [{ cols: 120, rows: 40 }]);

    fakePty.emitExit(0);
    assert.deepEqual(socket.sent.at(-1), { type: 'exit', code: 0 });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('confirmação é obrigatória, de uso único e expira', async () => {
  let now = 0;
  const service = new DashboardTerminalService({
    now: () => now,
    dashboardRoot: '/tmp/does-not-matter',
  });

  const missingSocket = new FakeSocket();
  await service.attach(undefined, missingSocket as never);
  assert.equal(missingSocket.closeCode, 1008);

  const confirmation = service.prepareConfirmation();
  now = 61_000;
  const expiredSocket = new FakeSocket();
  await service.attach(confirmation.token, expiredSocket as never);
  assert.equal(expiredSocket.closeCode, 1008);
});

test('desconectar o navegador encerra o PTY', async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), 'dev-dashboard-global-terminal-'),
  );
  await writeFile(path.join(root, 'init.sh'), '# test\n');

  try {
    const fakePty = new FakePty();
    const service = new DashboardTerminalService({
      dashboardRoot: root,
      spawnPty: () => fakePty as never,
    });
    const confirmation = service.prepareConfirmation();
    const socket = new FakeSocket();

    await service.attach(confirmation.token, socket as never);
    socket.close();

    assert.equal(fakePty.killed, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
