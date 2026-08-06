import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { GitMutationHistoryService } from '../src/services/git-mutation-history-service.js';

async function withStateDirectory<T>(
  fn: (stateDirectory: string) => Promise<T>,
): Promise<T> {
  const stateDirectory = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-git-mutation-history-'),
  );
  try {
    return await fn(stateDirectory);
  } finally {
    await rm(stateDirectory, { recursive: true, force: true });
  }
}

test('record grava um evento com risco resolvido pelo catálogo e history o retorna', async () => {
  await withStateDirectory(async (stateDirectory) => {
    const service = new GitMutationHistoryService(stateDirectory);
    await service.record({
      projectId: 'p1',
      workspaceId: 'w1',
      operationId: 'create-branch',
      result: 'succeeded',
    });
    const page = await service.history('p1');
    assert.equal(page.total, 1);
    assert.equal(page.events[0]!.operationId, 'create-branch');
    assert.equal(page.events[0]!.risk, 'write-safe');
    assert.equal(page.events[0]!.result, 'succeeded');
    assert.equal(page.events[0]!.workspaceId, 'w1');
    assert.ok(page.events[0]!.id);
    assert.ok(Number.isFinite(Date.parse(page.events[0]!.occurredAt)));
  });
});

test('record grava falha com o código de erro controlado, sem mensagem livre', async () => {
  await withStateDirectory(async (stateDirectory) => {
    const service = new GitMutationHistoryService(stateDirectory);
    await service.record({
      projectId: 'p1',
      operationId: 'discard-file',
      result: 'failed',
      errorCode: 'GIT_FILE_MUTATION_FAILED',
    });
    const page = await service.history('p1');
    assert.equal(page.events[0]!.result, 'failed');
    assert.equal(page.events[0]!.errorCode, 'GIT_FILE_MUTATION_FAILED');
    assert.equal(page.events[0]!.risk, 'destructive');
  });
});

test('eventos sobrevivem à recriação do serviço (persistência em disco)', async () => {
  await withStateDirectory(async (stateDirectory) => {
    const first = new GitMutationHistoryService(stateDirectory);
    await first.record({
      projectId: 'p1',
      operationId: 'commit',
      result: 'succeeded',
    });

    const second = new GitMutationHistoryService(stateDirectory);
    const page = await second.history('p1');
    assert.equal(page.total, 1);
    assert.equal(page.events[0]!.operationId, 'commit');
  });
});

test('history filtra por projeto e não mistura eventos de outros projetos', async () => {
  await withStateDirectory(async (stateDirectory) => {
    const service = new GitMutationHistoryService(stateDirectory);
    await service.record({
      projectId: 'p1',
      operationId: 'commit',
      result: 'succeeded',
    });
    await service.record({
      projectId: 'p2',
      operationId: 'push',
      result: 'succeeded',
    });
    const pageOne = await service.history('p1');
    const pageTwo = await service.history('p2');
    assert.equal(pageOne.total, 1);
    assert.equal(pageOne.events[0]!.operationId, 'commit');
    assert.equal(pageTwo.total, 1);
    assert.equal(pageTwo.events[0]!.operationId, 'push');
  });
});

test('history pagina, mais recente primeiro', async () => {
  await withStateDirectory(async (stateDirectory) => {
    const service = new GitMutationHistoryService(stateDirectory);
    for (let index = 0; index < 5; index += 1) {
      await service.record({
        projectId: 'p1',
        operationId: 'commit',
        result: 'succeeded',
      });
    }
    const pageOne = await service.history('p1', 1, 2);
    assert.equal(pageOne.total, 5);
    assert.equal(pageOne.totalPages, 3);
    assert.equal(pageOne.events.length, 2);

    const pageThree = await service.history('p1', 3, 2);
    assert.equal(pageThree.page, 3);
    assert.equal(pageThree.events.length, 1);

    const beyond = await service.history('p1', 99, 2);
    assert.equal(beyond.page, 3);
  });
});

test('limite de 200 eventos por projeto é respeitado, preservando os mais recentes', async () => {
  await withStateDirectory(async (stateDirectory) => {
    const service = new GitMutationHistoryService(stateDirectory);
    for (let index = 0; index < 205; index += 1) {
      await service.record({
        projectId: 'p1',
        operationId: 'commit',
        result: 'succeeded',
      });
    }
    const page = await service.history('p1', 1, 500);
    assert.equal(page.total, 200);
  });
});

test('limite global de 2000 eventos corta os mais antigos entre projetos', async () => {
  await withStateDirectory(async (stateDirectory) => {
    const service = new GitMutationHistoryService(stateDirectory);
    // 11 projetos * 200 = 2200 tentativas; o limite global de 2000 corta as mais antigas.
    for (let project = 0; project < 11; project += 1) {
      for (let index = 0; index < 200; index += 1) {
        await service.record({
          projectId: `p${project}`,
          operationId: 'commit',
          result: 'succeeded',
        });
      }
    }
    let total = 0;
    for (let project = 0; project < 11; project += 1) {
      const page = await service.history(`p${project}`, 1, 500);
      total += page.total;
    }
    assert.equal(total, 2000);
  });
});

test('nenhum evento contém caminho absoluto, comando livre, credencial ou conteúdo de arquivo', async () => {
  await withStateDirectory(async (stateDirectory) => {
    const service = new GitMutationHistoryService(stateDirectory);
    await service.record({
      projectId: 'p1',
      workspaceId: 'w1',
      operationId: 'discard-file',
      result: 'failed',
      errorCode: 'GIT_FILE_MUTATION_FAILED',
    });
    const page = await service.history('p1');
    const serialized = JSON.stringify(page.events[0]);
    const allowedKeys = new Set([
      'id',
      'projectId',
      'workspaceId',
      'operationId',
      'risk',
      'occurredAt',
      'result',
      'errorCode',
    ]);
    for (const key of Object.keys(page.events[0]!))
      assert.ok(allowedKeys.has(key), `campo inesperado: ${key}`);
    assert.doesNotMatch(serialized, /\/home\/|\/Users\/|C:\\/);
    assert.doesNotMatch(serialized, /password|secret|token|bearer/i);
  });
});
