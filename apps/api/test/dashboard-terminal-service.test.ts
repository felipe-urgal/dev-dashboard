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

  public close(code?: number, reason?: string): void {
    if (this.readyState === 3) return;
    this.closeCode = code;
    this.readyState = 3;
    this.emit('close', code ?? 1000, Buffer.from(reason ?? ''));
  }

  public clientMessage(message: unknown): void {
    this.emit('message', Buffer.from(JSON.stringify(message)), false);
  }

  public clientRaw(value: string, isBinary = false): void {
    this.emit('message', Buffer.from(value), isBinary);
  }
}

async function waitForOutput(
  socket: FakeSocket,
  expected: string,
): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    const output = socket.sent
      .filter(
        (message): message is { type: string; data: string } =>
          typeof message === 'object' &&
          message !== null &&
          (message as { type?: unknown }).type === 'output' &&
          typeof (message as { data?: unknown }).data === 'string',
      )
      .map((message) => message.data)
      .join('');
    if (output.includes(expected)) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail(`output esperado não recebido: ${expected}`);
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
    const ready = socket.sent[0] as {
      type: string;
      sessionId: string;
      reconnectToken: string;
      reconnected: boolean;
      reconnectGraceMs: number;
    };
    assert.equal(ready.type, 'ready');
    assert.equal(ready.sessionId.length, 32);
    assert.equal(ready.reconnectToken.length, 64);
    assert.equal(ready.reconnected, false);
    assert.equal(ready.reconnectGraceMs, 8_000);

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

test('transporte real WebSocket -> node-pty -> Bash envia input e recebe output', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dev-dashboard-real-pty-'));
  await writeFile(
    path.join(root, 'init.sh'),
    [
      'dev-tools() {',
      '  printf "PTY_READY\\n"',
      '  IFS= read -r line',
      '  printf "ECHO:%s\\n" "$line"',
      '}',
      '',
    ].join('\\n'),
  );

  const service = new DashboardTerminalService({
    dashboardRoot: root,
    reconnectGraceMs: 0,
  });
  const socket = new FakeSocket();

  try {
    await service.attach(service.prepareConfirmation().token, socket as never);
    await waitForOutput(socket, 'PTY_READY');

    socket.clientMessage({ type: 'input', data: 'hello-real-pty\\r' });
    await waitForOutput(socket, 'ECHO:hello-real-pty');
  } finally {
    socket.close(1000, 'Sessão encerrada pelo usuário');
    service.close();
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

test('fechamento explícito do navegador encerra o PTY imediatamente', async () => {
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
    socket.close(1000, 'Sessão encerrada pelo usuário');

    assert.equal(fakePty.killed, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('desconexão transitória preserva PTY e permite reconexão na mesma sessão', async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), 'dev-dashboard-global-terminal-'),
  );
  await writeFile(path.join(root, 'init.sh'), '# test\n');

  try {
    const fakePty = new FakePty();
    const service = new DashboardTerminalService({
      dashboardRoot: root,
      reconnectGraceMs: 100,
      spawnPty: () => fakePty as never,
    });
    const confirmation = service.prepareConfirmation();
    const firstSocket = new FakeSocket();

    await service.attach(confirmation.token, firstSocket as never);
    const ready = firstSocket.sent[0] as {
      sessionId: string;
      reconnectToken: string;
    };

    firstSocket.close(1006, 'network lost');
    assert.equal(fakePty.killed, false);

    fakePty.emitData('durante a queda');
    const secondSocket = new FakeSocket();
    await service.attach(undefined, secondSocket as never, {
      sessionId: ready.sessionId,
      reconnectToken: ready.reconnectToken,
    });

    assert.equal(fakePty.killed, false);
    assert.equal(
      (secondSocket.sent[0] as { type: string; reconnected: boolean }).type,
      'ready',
    );
    assert.equal(
      (secondSocket.sent[0] as { reconnected: boolean }).reconnected,
      true,
    );
    assert.deepEqual(secondSocket.sent[1], {
      type: 'output',
      data: 'durante a queda',
    });

    secondSocket.clientMessage({ type: 'input', data: 'x' });
    assert.deepEqual(fakePty.writes, ['x']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('PTY desconectado é encerrado após a janela de reconexão', async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), 'dev-dashboard-global-terminal-'),
  );
  await writeFile(path.join(root, 'init.sh'), '# test\n');

  try {
    const fakePty = new FakePty();
    const service = new DashboardTerminalService({
      dashboardRoot: root,
      reconnectGraceMs: 5,
      spawnPty: () => fakePty as never,
    });
    const confirmation = service.prepareConfirmation();
    const socket = new FakeSocket();

    await service.attach(confirmation.token, socket as never);
    socket.close(1006, 'network lost');
    assert.equal(fakePty.killed, false);

    await new Promise((resolve) => setTimeout(resolve, 15));
    assert.equal(fakePty.killed, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('reconexão inválida falha fechado sem criar novo PTY', async () => {
  const service = new DashboardTerminalService({
    dashboardRoot: '/tmp/does-not-matter',
  });
  const socket = new FakeSocket();

  await service.attach(undefined, socket as never, {
    sessionId: 'a'.repeat(32),
    reconnectToken: 'b'.repeat(64),
  });

  assert.equal(socket.closeCode, 1008);
  assert.equal((socket.sent[0] as { type: string }).type, 'error');
});

test('mensagem binária, JSON inválido e tipo desconhecido são rejeitados', async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), 'dev-dashboard-global-terminal-'),
  );
  await writeFile(path.join(root, 'init.sh'), '# test\n');

  try {
    for (const sendInvalid of [
      (socket: FakeSocket) => socket.clientRaw('{}', true),
      (socket: FakeSocket) => socket.clientRaw('{'),
      (socket: FakeSocket) => socket.clientMessage({ type: 'unknown' }),
    ]) {
      const fakePty = new FakePty();
      const service = new DashboardTerminalService({
        dashboardRoot: root,
        reconnectGraceMs: 0,
        spawnPty: () => fakePty as never,
      });
      const confirmation = service.prepareConfirmation();
      const socket = new FakeSocket();
      await service.attach(confirmation.token, socket as never);

      sendInvalid(socket);
      assert.ok([1003, 1007].includes(socket.closeCode ?? 0));
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('resize é limitado e saída pendente é bounded durante desconexão', async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), 'dev-dashboard-global-terminal-'),
  );
  await writeFile(path.join(root, 'init.sh'), '# test\n');

  try {
    const fakePty = new FakePty();
    const service = new DashboardTerminalService({
      dashboardRoot: root,
      reconnectGraceMs: 100,
      spawnPty: () => fakePty as never,
    });
    const confirmation = service.prepareConfirmation();
    const firstSocket = new FakeSocket();
    await service.attach(confirmation.token, firstSocket as never);
    const ready = firstSocket.sent[0] as {
      sessionId: string;
      reconnectToken: string;
    };

    firstSocket.clientMessage({ type: 'resize', cols: 9999, rows: -5 });
    assert.deepEqual(fakePty.resizes, [{ cols: 500, rows: 1 }]);

    firstSocket.close(1006, 'network lost');
    fakePty.emitData('x'.repeat(300_000));

    const secondSocket = new FakeSocket();
    await service.attach(undefined, secondSocket as never, {
      sessionId: ready.sessionId,
      reconnectToken: ready.reconnectToken,
    });
    const output = secondSocket.sent[1] as { type: string; data: string };
    assert.equal(output.type, 'output');
    assert.ok(Buffer.byteLength(output.data, 'utf8') <= 262_144);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('limite de sessões retorna feedback e libera vaga após fechamento explícito', async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), 'dev-dashboard-global-terminal-'),
  );
  await writeFile(path.join(root, 'init.sh'), '# test\n');

  try {
    const service = new DashboardTerminalService({
      dashboardRoot: root,
      spawnPty: () => new FakePty() as never,
    });
    const sockets: FakeSocket[] = [];

    for (let index = 0; index < 4; index += 1) {
      const socket = new FakeSocket();
      sockets.push(socket);
      const confirmation = service.prepareConfirmation();
      await service.attach(confirmation.token, socket as never);
      assert.equal((socket.sent[0] as { type: string }).type, 'ready');
    }

    const rejected = new FakeSocket();
    await service.attach(
      service.prepareConfirmation().token,
      rejected as never,
    );
    assert.equal(rejected.closeCode, 1013);
    assert.match(
      (rejected.sent[0] as { message: string }).message,
      /Limite de sessões/,
    );

    sockets[0]?.close(1000, 'Sessão encerrada pelo usuário');

    const replacement = new FakeSocket();
    await service.attach(
      service.prepareConfirmation().token,
      replacement as never,
    );
    assert.equal((replacement.sent[0] as { type: string }).type, 'ready');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
