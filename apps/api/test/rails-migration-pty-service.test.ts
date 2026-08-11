import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

import { DetachableExecutionService } from '../src/services/detachable-execution-service.js';
import { RailsMigrationPtyService } from '../src/services/rails-migration-pty-service.js';
import { RailsMutationError } from '../src/services/rails-inspection/errors.js';

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

  public write(): void {}
  public resize(): void {}

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

async function fixture(
  files: Record<string, string>,
  type: Project['type'] = 'rails',
): Promise<Project> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'rails-migration-pty-'));
  for (const [name, contents] of Object.entries(files)) {
    const target = path.join(root, name);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, contents);
  }
  return {
    id: 'projeto',
    name: 'Projeto',
    path: root,
    type,
    source: 'standalone',
    favorite: false,
    enabled: true,
    capabilities: [],
  };
}

function railsFixture(): Promise<Project> {
  return fixture({ 'bin/rails': '#!/bin/sh\n', Gemfile: 'gem "rails"\n' });
}

test('start() usa bin/rails e monta o comando esperado por operação', async () => {
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
  const service = new RailsMigrationPtyService(detachable);
  const project = await railsFixture();

  const snapshot = await service.start(project, 'migrate');

  assert.equal(spawnedFile, path.join(project.path, 'bin', 'rails'));
  assert.deepEqual(spawnedArgs, ['db:migrate']);
  assert.equal(snapshot.operation, 'migrate');
  assert.equal(snapshot.status, 'running');
});

test('rollback usa STEP=1', async () => {
  const fakePty = new FakePty();
  let spawnedArgs: readonly string[] | undefined;
  const detachable = new DetachableExecutionService({
    spawnPty: (_file, args) => {
      spawnedArgs = args;
      return fakePty as never;
    },
  });
  const service = new RailsMigrationPtyService(detachable);
  const project = await railsFixture();

  await service.start(project, 'rollback');

  assert.deepEqual(spawnedArgs, ['db:rollback', 'STEP=1']);
});

test('start() lança RAILS_MUTATION_UNSUPPORTED para projeto sem Rails', async () => {
  const detachable = new DetachableExecutionService();
  const service = new RailsMigrationPtyService(detachable);
  const project = await fixture({ 'package.json': '{}' }, 'node');

  await assert.rejects(
    () => service.start(project, 'migrate'),
    (error: unknown) =>
      error instanceof RailsMutationError &&
      error.code === 'RAILS_MUTATION_UNSUPPORTED',
  );
});

test('start() lança RAILS_MUTATION_ALREADY_RUNNING numa segunda chamada', async () => {
  const fakePty = new FakePty();
  const detachable = new DetachableExecutionService({
    spawnPty: () => fakePty as never,
  });
  const service = new RailsMigrationPtyService(detachable);
  const project = await railsFixture();

  await service.start(project, 'migrate');

  await assert.rejects(
    () => service.start(project, 'seed'),
    (error: unknown) =>
      error instanceof RailsMutationError &&
      error.code === 'RAILS_MUTATION_ALREADY_RUNNING',
  );
});

test('attach() envia ready com a operação e o snapshot, e detach não mata o processo', async () => {
  const fakePty = new FakePty();
  const detachable = new DetachableExecutionService({
    spawnPty: () => fakePty as never,
  });
  const service = new RailsMigrationPtyService(detachable);
  const project = await railsFixture();

  await service.start(project, 'seed');

  const socket = new FakeSocket();
  service.attach(project, socket as never);

  const ready = socket.sent[0] as {
    type: string;
    snapshot: { operation: string };
  };
  assert.equal(ready.type, 'ready');
  assert.equal(ready.snapshot.operation, 'seed');

  fakePty.emitData('rodando seeds...\n');
  assert.deepEqual(socket.sent.at(-1), {
    type: 'output',
    data: 'rodando seeds...\n',
  });

  socket.close();
  assert.equal(detachable.isRunning('projeto:migration-pty'), true);
});

test('attach() sem execução em andamento envia erro e fecha o socket', async () => {
  const detachable = new DetachableExecutionService();
  const service = new RailsMigrationPtyService(detachable);
  const project = await railsFixture();

  const socket = new FakeSocket();
  service.attach(project, socket as never);

  assert.equal(socket.closeCode, 1000);
  assert.equal((socket.sent[0] as { type: string }).type, 'error');
});

test('cancel() delega para DetachableExecutionService.cancel()', async () => {
  const fakePty = new FakePty();
  const detachable = new DetachableExecutionService({
    spawnPty: () => fakePty as never,
  });
  const service = new RailsMigrationPtyService(detachable);
  const project = await railsFixture();

  await service.start(project, 'prepare');
  service.cancel(project);

  assert.deepEqual(fakePty.kills, ['SIGTERM']);
});
