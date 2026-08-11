import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

import { DetachableExecutionService } from '../src/services/detachable-execution-service.js';
import {
  ProjectDependenciesPtyError,
  ProjectDependenciesPtyService,
} from '../src/services/project-dependencies-pty-service.js';
import { ScriptDetectionService } from '../src/services/script-detection-service.js';

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
  type: Project['type'] = 'node',
): Promise<Project> {
  const root = await mkdtemp(
    path.join(os.tmpdir(), 'project-dependencies-pty-'),
  );
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

function nodeFixture(): Promise<Project> {
  return fixture({
    'package.json': JSON.stringify({ scripts: { build: 'vite build' } }),
    'package-lock.json': '{}',
  });
}

function railsFixture(): Promise<Project> {
  return fixture({ Gemfile: 'gem "rails"\n' }, 'rails');
}

test('start() usa o gerenciador Node detectado para package-manager:install', async () => {
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
  const service = new ProjectDependenciesPtyService(
    detachable,
    new ScriptDetectionService(),
  );
  const project = await nodeFixture();

  const snapshot = await service.start(project, 'package-manager:install');

  assert.equal(spawnedFile, 'npm');
  assert.deepEqual(spawnedArgs, ['install']);
  assert.equal(snapshot.actionId, 'package-manager:install');
  assert.equal(snapshot.status, 'running');
});

test('start() roda o script build declarado no package.json', async () => {
  const fakePty = new FakePty();
  let spawnedArgs: readonly string[] | undefined;
  const detachable = new DetachableExecutionService({
    spawnPty: (_file, args) => {
      spawnedArgs = args;
      return fakePty as never;
    },
  });
  const service = new ProjectDependenciesPtyService(
    detachable,
    new ScriptDetectionService(),
  );
  const project = await nodeFixture();

  const snapshot = await service.start(project, 'package-script:build');

  assert.deepEqual(spawnedArgs, ['run', 'build']);
  assert.equal(snapshot.actionName, 'build');
});

test('start() lança ACTION_NOT_FOUND para uma ação fora do catálogo de dependências', async () => {
  const detachable = new DetachableExecutionService();
  const service = new ProjectDependenciesPtyService(
    detachable,
    new ScriptDetectionService(),
  );
  const project = await nodeFixture();

  await assert.rejects(
    () => service.start(project, 'package-script:does-not-exist'),
    (error: unknown) =>
      error instanceof ProjectDependenciesPtyError &&
      error.code === 'ACTION_NOT_FOUND',
  );
});

test('start() lança ALREADY_RUNNING numa segunda chamada', async () => {
  const fakePty = new FakePty();
  const detachable = new DetachableExecutionService({
    spawnPty: () => fakePty as never,
  });
  const service = new ProjectDependenciesPtyService(
    detachable,
    new ScriptDetectionService(),
  );
  const project = await railsFixture();

  await service.start(project, 'bundler:install');

  await assert.rejects(
    () => service.start(project, 'bundler:update'),
    (error: unknown) =>
      error instanceof ProjectDependenciesPtyError &&
      error.code === 'ALREADY_RUNNING',
  );
});

test('attach() envia ready com a ação e o snapshot, e detach não mata o processo', async () => {
  const fakePty = new FakePty();
  const detachable = new DetachableExecutionService({
    spawnPty: () => fakePty as never,
  });
  const service = new ProjectDependenciesPtyService(
    detachable,
    new ScriptDetectionService(),
  );
  const project = await railsFixture();

  await service.start(project, 'bundler:install');

  const socket = new FakeSocket();
  service.attach(project, socket as never);

  const ready = socket.sent[0] as {
    type: string;
    snapshot: { actionId: string };
  };
  assert.equal(ready.type, 'ready');
  assert.equal(ready.snapshot.actionId, 'bundler:install');

  fakePty.emitData('Installing gems...\n');
  assert.deepEqual(socket.sent.at(-1), {
    type: 'output',
    data: 'Installing gems...\n',
  });

  socket.close();
  assert.equal(detachable.isRunning('projeto:dependencies-pty'), true);
});

test('attach() sem execução em andamento envia erro e fecha o socket', async () => {
  const detachable = new DetachableExecutionService();
  const service = new ProjectDependenciesPtyService(
    detachable,
    new ScriptDetectionService(),
  );
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
  const service = new ProjectDependenciesPtyService(
    detachable,
    new ScriptDetectionService(),
  );
  const project = await nodeFixture();

  await service.start(project, 'package-manager:install');
  service.cancel(project);

  assert.deepEqual(fakePty.kills, ['SIGTERM']);
});
