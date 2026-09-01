import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
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

async function temporaryProject(t: test.TestContext): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'dev-dashboard-test-pty-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
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

test('start() injeta .env.check.local e promove CHECK_DATABASE_URL apenas no processo de teste', async (t) => {
  const directory = await temporaryProject(t);
  const dashboardDirectory = path.join(directory, '.dev-dashboard');
  await mkdir(dashboardDirectory);
  await writeFile(
    path.join(dashboardDirectory, '.env.check.local'),
    [
      'CHECK_DATABASE_URL="postgresql://check.example/app"',
      'TEST_ONLY_FLAG=check',
      '',
    ].join('\n'),
  );
  await writeFile(
    path.join(dashboardDirectory, '.env.production.local'),
    [
      'DATABASE_URL="postgresql://production.example/app"',
      'PRODUCTION_ONLY_FLAG=production',
      '',
    ].join('\n'),
  );

  const previousVercelToken = process.env.VERCEL_TOKEN;
  const previousVercelTeamId = process.env.VERCEL_TEAM_ID;
  process.env.VERCEL_TOKEN = 'segredo-dashboard';
  process.env.VERCEL_TEAM_ID = 'team-dashboard';

  try {
    const fakePty = new FakePty();
    let spawnedEnvironment: NodeJS.ProcessEnv | undefined;
    const detachable = new DetachableExecutionService({
      spawnPty: (_file, _args, options) => {
        spawnedEnvironment = options.env;
        return fakePty as never;
      },
    });
    const service = new ProjectTestPtyService(
      detachable,
      stubDetection({ command: 'pnpm', args: ['run', 'test'] }),
    );

    await service.start(project({ path: directory }), 'full-suite');

    assert.equal(
      spawnedEnvironment?.DATABASE_URL,
      'postgresql://check.example/app',
    );
    assert.equal(
      spawnedEnvironment?.CHECK_DATABASE_URL,
      'postgresql://check.example/app',
    );
    assert.equal(spawnedEnvironment?.TEST_ONLY_FLAG, 'check');
    assert.equal(spawnedEnvironment?.PRODUCTION_ONLY_FLAG, undefined);
    assert.equal(spawnedEnvironment?.VERCEL_TOKEN, '');
    assert.equal(spawnedEnvironment?.VERCEL_TEAM_ID, '');
  } finally {
    if (previousVercelToken === undefined) delete process.env.VERCEL_TOKEN;
    else process.env.VERCEL_TOKEN = previousVercelToken;
    if (previousVercelTeamId === undefined) delete process.env.VERCEL_TEAM_ID;
    else process.env.VERCEL_TEAM_ID = previousVercelTeamId;
  }
});

test('start() aceita projeto sem .env.check.local, preserva ambiente operacional e não herda DATABASE_URL/provider', async () => {
  const previousInherited = process.env.TEST_PTY_INHERITED;
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const previousVercelToken = process.env.VERCEL_TOKEN;
  const previousVercelTeamId = process.env.VERCEL_TEAM_ID;
  process.env.TEST_PTY_INHERITED = 'herdado';
  process.env.DATABASE_URL = 'postgresql://nao-pode-vazar.example/app';
  process.env.VERCEL_TOKEN = 'segredo-dashboard';
  process.env.VERCEL_TEAM_ID = 'team-dashboard';

  try {
    const fakePty = new FakePty();
    let spawnedEnvironment: NodeJS.ProcessEnv | undefined;
    const detachable = new DetachableExecutionService({
      spawnPty: (_file, _args, options) => {
        spawnedEnvironment = options.env;
        return fakePty as never;
      },
    });
    const service = new ProjectTestPtyService(
      detachable,
      stubDetection({ command: 'npm', args: ['test'] }),
    );

    await service.start(project(), 'full-suite');

    assert.equal(spawnedEnvironment?.TEST_PTY_INHERITED, 'herdado');
    assert.equal(spawnedEnvironment?.DATABASE_URL, '');
    assert.equal(spawnedEnvironment?.VERCEL_TOKEN, '');
    assert.equal(spawnedEnvironment?.VERCEL_TEAM_ID, '');
  } finally {
    if (previousInherited === undefined) delete process.env.TEST_PTY_INHERITED;
    else process.env.TEST_PTY_INHERITED = previousInherited;
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
    if (previousVercelToken === undefined) delete process.env.VERCEL_TOKEN;
    else process.env.VERCEL_TOKEN = previousVercelToken;
    if (previousVercelTeamId === undefined) delete process.env.VERCEL_TEAM_ID;
    else process.env.VERCEL_TEAM_ID = previousVercelTeamId;
  }
});

test('start() falha fechado antes do spawn quando .env.check.local é inválido', async (t) => {
  const directory = await temporaryProject(t);
  const dashboardDirectory = path.join(directory, '.dev-dashboard');
  await mkdir(dashboardDirectory);
  await mkdir(path.join(dashboardDirectory, '.env.check.local'));

  let spawned = false;
  const detachable = new DetachableExecutionService({
    spawnPty: () => {
      spawned = true;
      return new FakePty() as never;
    },
  });
  const service = new ProjectTestPtyService(
    detachable,
    stubDetection({ command: 'npm', args: ['test'] }),
  );

  await assert.rejects(
    () => service.start(project({ path: directory }), 'full-suite'),
    (error: unknown) =>
      error instanceof ProjectTestPtyError &&
      error.code === 'START_FAILED' &&
      /ambiente local de check/i.test(error.message),
  );
  assert.equal(spawned, false);
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
