import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { ManagedProcess, ProcessLogSnapshot, TestExecutionEvent } from '@dev-dashboard/contracts';

import { TestExecutionHistoryService, TestExecutionSubscriptionError } from '../src/services/test-execution-history-service.js';

function fakeProcessManager(initial: ManagedProcess | null = null) {
  let current = initial;
  let logContent = '';
  return {
    getTestProcess: async (_projectId: string) => current,
    readTestLog: async (projectId: string): Promise<ProcessLogSnapshot> => ({
      projectId, processId: current?.id ?? 'unknown', content: logContent,
      sizeBytes: logContent.length, truncated: false, masked: false, redactionCount: 0,
      readAt: new Date().toISOString(),
    }),
    set(value: ManagedProcess | null) { current = value; },
    setLog(value: string) { logContent = value; },
  };
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
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

test('clear remove entradas terminais e preserva execuções em andamento', async (context) => {
  const stateDirectory = await mkdtemp(path.join(tmpdir(), 'dev-dashboard-test-history-'));
  context.after(async () => { await rm(stateDirectory, { recursive: true, force: true }); });
  const pm = fakeProcessManager();
  const service = new TestExecutionHistoryService(pm, stateDirectory);

  const finished = makeManagedProcess({ id: 'node-script-test' });
  pm.set(finished);
  await service.recordStart('p1', finished);
  pm.set({ ...finished, status: 'stopped', stoppedAt: new Date().toISOString(), exitCode: 0 });
  await service.reconcile('p1');

  const running = makeManagedProcess({ id: 'node-script-test:file', args: ['run', 'test', '--', 'src/app.test.ts'] });
  pm.set(running);
  await service.recordStart('p1', running);

  const result = await service.clear('p1');
  assert.equal(result.removedCount, 1);

  const history = await service.history('p1');
  assert.equal(history.total, 1);
  assert.equal(history.items[0]!.status, 'running');
  assert.equal(history.items[0]!.targetFile, 'src/app.test.ts');
});

test('clear não faz nada quando não há entradas terminais', async (context) => {
  const stateDirectory = await mkdtemp(path.join(tmpdir(), 'dev-dashboard-test-history-'));
  context.after(async () => { await rm(stateDirectory, { recursive: true, force: true }); });
  const pm = fakeProcessManager();
  const service = new TestExecutionHistoryService(pm, stateDirectory);

  const result = await service.clear('p1');
  assert.equal(result.removedCount, 0);
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

test('subscribe rejeita quando não há execução em andamento', async (context) => {
  const stateDirectory = await mkdtemp(path.join(tmpdir(), 'dev-dashboard-test-history-'));
  context.after(async () => { await rm(stateDirectory, { recursive: true, force: true }); });
  const service = new TestExecutionHistoryService(fakeProcessManager(), stateDirectory);
  await assert.rejects(
    () => service.subscribe('p1', { send: () => undefined, close: () => undefined }),
    (error: unknown) => error instanceof TestExecutionSubscriptionError && error.code === 'TEST_EXECUTION_NOT_FOUND',
  );
  service.close();
});

test('subscribe envia estado e log imediatos ao assinar', async (context) => {
  const stateDirectory = await mkdtemp(path.join(tmpdir(), 'dev-dashboard-test-history-'));
  context.after(async () => { await rm(stateDirectory, { recursive: true, force: true }); });
  const pm = fakeProcessManager();
  const managed = makeManagedProcess();
  pm.set(managed);
  pm.setLog('linha inicial');
  const service = new TestExecutionHistoryService(pm, stateDirectory);
  context.after(() => service.close());

  const events: TestExecutionEvent[] = [];
  const unsubscribe = await service.subscribe('p1', { send: (event) => events.push(event), close: () => undefined });
  context.after(unsubscribe);

  assert.equal(events[0]?.type, 'state');
  assert.equal(events[1]?.type, 'log');
  assert.equal(events[1]?.type === 'log' ? events[1].log.content : undefined, 'linha inicial');
});

test('detecta o fim da execução via polling, atualiza o histórico e fecha o assinante', async (context) => {
  const stateDirectory = await mkdtemp(path.join(tmpdir(), 'dev-dashboard-test-history-'));
  context.after(async () => { await rm(stateDirectory, { recursive: true, force: true }); });
  const pm = fakeProcessManager();
  const managed = makeManagedProcess();
  pm.set(managed);
  const service = new TestExecutionHistoryService(pm, stateDirectory);
  context.after(() => service.close());
  await service.recordStart('p1', managed);

  const events: TestExecutionEvent[] = [];
  const closed = new Promise<void>((resolve) => {
    void service.subscribe('p1', { send: (event) => events.push(event), close: resolve });
  });

  pm.set({ ...managed, status: 'stopped', stoppedAt: new Date().toISOString(), exitCode: 0 });
  await closed;

  assert.equal(
    events.some((event) => event.type === 'state' && event.process.status === 'stopped'),
    true,
  );
  const history = await service.history('p1');
  assert.equal(history.items[0]!.status, 'stopped');
  assert.equal(history.items[0]!.exitCode, 0);
});

test('publica log quando o conteúdo muda durante o polling', async (context) => {
  const stateDirectory = await mkdtemp(path.join(tmpdir(), 'dev-dashboard-test-history-'));
  context.after(async () => { await rm(stateDirectory, { recursive: true, force: true }); });
  const pm = fakeProcessManager();
  const managed = makeManagedProcess();
  pm.set(managed);
  const service = new TestExecutionHistoryService(pm, stateDirectory);
  context.after(() => service.close());

  const events: TestExecutionEvent[] = [];
  const unsubscribe = await service.subscribe('p1', { send: (event) => events.push(event), close: () => undefined });
  context.after(unsubscribe);

  pm.setLog('saída em andamento');
  await sleep(700);

  assert.equal(
    events.some((event) => event.type === 'log' && event.log.content === 'saída em andamento'),
    true,
  );
});

test('limita assinantes simultâneos por projeto', async (context) => {
  const stateDirectory = await mkdtemp(path.join(tmpdir(), 'dev-dashboard-test-history-'));
  context.after(async () => { await rm(stateDirectory, { recursive: true, force: true }); });
  const pm = fakeProcessManager();
  pm.set(makeManagedProcess());
  const service = new TestExecutionHistoryService(pm, stateDirectory);
  context.after(() => service.close());

  const subscriptions = await Promise.all(Array.from({ length: 5 }, () =>
    service.subscribe('p1', { send: () => undefined, close: () => undefined }),
  ));
  await assert.rejects(
    () => service.subscribe('p1', { send: () => undefined, close: () => undefined }),
    (error: unknown) => error instanceof TestExecutionSubscriptionError && error.code === 'TEST_EXECUTION_SUBSCRIBER_LIMIT',
  );
  for (const unsubscribe of subscriptions) unsubscribe();
});
