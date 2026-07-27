import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { ManagedProcess } from '@dev-dashboard/contracts';

import { TestExecutionHistoryService } from '../src/services/test-execution-history-service.js';

function fakeProcessManager(initial: ManagedProcess | null = null) {
  let current = initial;
  return {
    getTestProcess: async (_projectId: string) => current,
    set(value: ManagedProcess | null) { current = value; },
  };
}

function makeManagedProcess(overrides: Partial<ManagedProcess> = {}): ManagedProcess {
  return {
    id: 'node-script-test',
    projectId: 'p1',
    kind: 'test',
    status: 'running',
    command: 'npm',
    args: ['run', 'test'],
    startedAt: new Date().toISOString(),
    ...overrides,
  };
}

test('recordStart cria uma entrada aberta e history a retorna', async (context) => {
  const stateDirectory = await mkdtemp(path.join(tmpdir(), 'dev-dashboard-test-history-'));
  context.after(async () => { await rm(stateDirectory, { recursive: true, force: true }); });
  const pm = fakeProcessManager();
  const service = new TestExecutionHistoryService(pm, stateDirectory);

  const managed = makeManagedProcess();
  pm.set(managed);
  await service.recordStart('p1', managed);
  const history = await service.history('p1');
  assert.equal(history.total, 1);
  assert.equal(history.items[0]!.status, 'running');
  assert.equal(history.items[0]!.commandId, 'node-script-test');
  assert.equal(history.items[0]!.targetFile, undefined);
});

test('recordStart deriva o arquivo alvo de execuções com sufixo :file', async (context) => {
  const stateDirectory = await mkdtemp(path.join(tmpdir(), 'dev-dashboard-test-history-'));
  context.after(async () => { await rm(stateDirectory, { recursive: true, force: true }); });
  const pm = fakeProcessManager();
  const service = new TestExecutionHistoryService(pm, stateDirectory);

  const managed = makeManagedProcess({
    id: 'node-script-test:file',
    args: ['run', 'test', '--', 'src/app.test.ts'],
  });
  pm.set(managed);
  await service.recordStart('p1', managed);
  const history = await service.history('p1');
  assert.equal(history.items[0]!.commandId, 'node-script-test');
  assert.equal(history.items[0]!.targetFile, 'src/app.test.ts');
});

test('reconcile finaliza a entrada aberta quando o processo termina', async (context) => {
  const stateDirectory = await mkdtemp(path.join(tmpdir(), 'dev-dashboard-test-history-'));
  context.after(async () => { await rm(stateDirectory, { recursive: true, force: true }); });
  const pm = fakeProcessManager();
  const service = new TestExecutionHistoryService(pm, stateDirectory);

  const managed = makeManagedProcess();
  pm.set(managed);
  await service.recordStart('p1', managed);

  pm.set({ ...managed, status: 'stopped', stoppedAt: new Date().toISOString(), exitCode: 0 });
  await service.reconcile('p1');

  const history = await service.history('p1');
  assert.equal(history.items[0]!.status, 'stopped');
  assert.equal(history.items[0]!.exitCode, 0);
  assert.ok(history.items[0]!.finishedAt);
});

test('reconcile marca como failed quando o processo gerenciado desaparece', async (context) => {
  const stateDirectory = await mkdtemp(path.join(tmpdir(), 'dev-dashboard-test-history-'));
  context.after(async () => { await rm(stateDirectory, { recursive: true, force: true }); });
  const pm = fakeProcessManager();
  const service = new TestExecutionHistoryService(pm, stateDirectory);

  const managed = makeManagedProcess();
  pm.set(managed);
  await service.recordStart('p1', managed);

  pm.set(null);
  await service.reconcile('p1');

  const history = await service.history('p1');
  assert.equal(history.items[0]!.status, 'failed');
  assert.ok(history.items[0]!.finishedAt);
});

test('o histórico sobrevive à recriação do serviço (reinício da API)', async (context) => {
  const stateDirectory = await mkdtemp(path.join(tmpdir(), 'dev-dashboard-test-history-'));
  context.after(async () => { await rm(stateDirectory, { recursive: true, force: true }); });
  const pm = fakeProcessManager();
  const first = new TestExecutionHistoryService(pm, stateDirectory);

  const managed = makeManagedProcess({ status: 'stopped', stoppedAt: new Date().toISOString(), exitCode: 0 });
  await first.recordStart('p1', managed);

  const second = new TestExecutionHistoryService(fakeProcessManager(), stateDirectory);
  const history = await second.history('p1');
  assert.equal(history.total, 1);
  assert.equal(history.items[0]!.status, 'stopped');
});

test('history pagina execuções mais recentes primeiro', async (context) => {
  const stateDirectory = await mkdtemp(path.join(tmpdir(), 'dev-dashboard-test-history-'));
  context.after(async () => { await rm(stateDirectory, { recursive: true, force: true }); });
  const pm = fakeProcessManager();
  const service = new TestExecutionHistoryService(pm, stateDirectory);

  for (let index = 0; index < 3; index += 1) {
    const managed = makeManagedProcess({ status: 'stopped', stoppedAt: new Date().toISOString(), exitCode: 0 });
    await service.recordStart('p1', managed);
  }

  const page1 = await service.history('p1', 1, 2);
  assert.equal(page1.total, 3);
  assert.equal(page1.totalPages, 2);
  assert.equal(page1.items.length, 2);

  const page2 = await service.history('p1', 2, 2);
  assert.equal(page2.items.length, 1);
});

test('history retorna vazio quando o arquivo persistido está corrompido', async (context) => {
  const stateDirectory = await mkdtemp(path.join(tmpdir(), 'dev-dashboard-test-history-'));
  context.after(async () => { await rm(stateDirectory, { recursive: true, force: true }); });
  const historyDirectory = path.join(stateDirectory, 'tests-history');
  await mkdir(historyDirectory, { recursive: true });
  await writeFile(path.join(historyDirectory, 'p1.json'), 'not json');

  const service = new TestExecutionHistoryService(fakeProcessManager(), stateDirectory);
  const history = await service.history('p1');
  assert.deepEqual(history.items, []);
  assert.equal(history.total, 0);
});

test('respeita o limite de histórico configurado', async (context) => {
  const stateDirectory = await mkdtemp(path.join(tmpdir(), 'dev-dashboard-test-history-'));
  context.after(async () => { await rm(stateDirectory, { recursive: true, force: true }); });
  const pm = fakeProcessManager();
  const service = new TestExecutionHistoryService(pm, stateDirectory, 2);

  for (let index = 0; index < 3; index += 1) {
    const managed = makeManagedProcess({ status: 'stopped', stoppedAt: new Date().toISOString(), exitCode: 0 });
    await service.recordStart('p1', managed);
  }

  const history = await service.history('p1', 1, 10);
  assert.equal(history.total, 2);
});
