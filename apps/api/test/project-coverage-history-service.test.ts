import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { ProjectCoverageSummary } from '@dev-dashboard/contracts';

import { ProjectCoverageHistoryService } from '../src/services/project-coverage-history-service.js';

function makeSummary(
  overrides: Partial<ProjectCoverageSummary> = {},
): ProjectCoverageSummary {
  return {
    available: true,
    generatedAt: '2026-08-06T10:00:00.000Z',
    total: {
      statements: { total: 10, covered: 9, pct: 90 },
      branches: { total: 8, covered: 4, pct: 50 },
      functions: { total: 5, covered: 1, pct: 20 },
      lines: { total: 10, covered: 9, pct: 90 },
    },
    ...overrides,
  };
}

async function withTempStateDir(
  run: (stateDirectory: string) => Promise<void>,
): Promise<void> {
  const stateDirectory = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-coverage-history-'),
  );
  try {
    await run(stateDirectory);
  } finally {
    await rm(stateDirectory, { recursive: true, force: true });
  }
}

test('history() retorna vazio quando nada foi registrado', async () => {
  await withTempStateDir(async (stateDirectory) => {
    const service = new ProjectCoverageHistoryService(stateDirectory);
    const history = await service.history('p1');
    assert.deepEqual(history, { items: [], total: 0 });
  });
});

test('record() ignora relatórios indisponíveis ou sem generatedAt', async () => {
  await withTempStateDir(async (stateDirectory) => {
    const service = new ProjectCoverageHistoryService(stateDirectory);
    await service.record('p1', { available: false });
    await service.record('p1', {
      available: true,
      total: makeSummary().total,
    });

    const history = await service.history('p1');
    assert.deepEqual(history, { items: [], total: 0 });
  });
});

test('record() grava um snapshot com os totais agregados', async () => {
  await withTempStateDir(async (stateDirectory) => {
    const service = new ProjectCoverageHistoryService(stateDirectory);
    await service.record('p1', makeSummary());

    const history = await service.history('p1');
    assert.equal(history.total, 1);
    assert.equal(history.items[0]!.generatedAt, '2026-08-06T10:00:00.000Z');
    assert.deepEqual(history.items[0]!.total, makeSummary().total);
    assert.ok(history.items[0]!.id);
    assert.ok(history.items[0]!.recordedAt);
  });
});

test('record() persiste arquivos e identidade Git quando disponíveis', async () => {
  await withTempStateDir(async (stateDirectory) => {
    const service = new ProjectCoverageHistoryService(
      stateDirectory,
      50,
      async (projectPath) => {
        assert.equal(projectPath, '/workspace/sample');
        return {
          gitRevision: 'abc123',
          gitDirtyFingerprint: 'clean',
        };
      },
    );
    const file = {
      path: 'src/auth.ts',
      statements: { total: 10, covered: 8, pct: 80 },
      branches: { total: 4, covered: 2, pct: 50 },
      functions: { total: 2, covered: 2, pct: 100 },
      lines: { total: 10, covered: 8, pct: 80 },
    };

    await service.record(
      'p1',
      makeSummary({ files: [file] }),
      '/workspace/sample',
    );

    const history = await service.history('p1');
    assert.equal(history.items[0]!.gitRevision, 'abc123');
    assert.equal(history.items[0]!.gitDirtyFingerprint, 'clean');
    assert.deepEqual(history.items[0]!.files, [file]);
  });
});

test('record() não duplica quando o generatedAt já foi registrado', async () => {
  await withTempStateDir(async (stateDirectory) => {
    const service = new ProjectCoverageHistoryService(stateDirectory);
    await service.record('p1', makeSummary());
    await service.record('p1', makeSummary());

    const history = await service.history('p1');
    assert.equal(history.total, 1);
  });
});

test('record() mantém histórico separado por projeto', async () => {
  await withTempStateDir(async (stateDirectory) => {
    const service = new ProjectCoverageHistoryService(stateDirectory);
    await service.record('p1', makeSummary());
    await service.record(
      'p2',
      makeSummary({ generatedAt: '2026-08-06T11:00:00.000Z' }),
    );

    const historyP1 = await service.history('p1');
    const historyP2 = await service.history('p2');
    assert.equal(historyP1.total, 1);
    assert.equal(historyP2.total, 1);
    assert.equal(historyP1.items[0]!.generatedAt, '2026-08-06T10:00:00.000Z');
    assert.equal(historyP2.items[0]!.generatedAt, '2026-08-06T11:00:00.000Z');
  });
});

test('record() respeita o limite de retenção e descarta os mais antigos', async () => {
  await withTempStateDir(async (stateDirectory) => {
    const service = new ProjectCoverageHistoryService(stateDirectory, 2);
    await service.record(
      'p1',
      makeSummary({ generatedAt: '2026-08-06T09:00:00.000Z' }),
    );
    await service.record(
      'p1',
      makeSummary({ generatedAt: '2026-08-06T10:00:00.000Z' }),
    );
    await service.record(
      'p1',
      makeSummary({ generatedAt: '2026-08-06T11:00:00.000Z' }),
    );

    const history = await service.history('p1');
    assert.equal(history.total, 2);
    assert.deepEqual(
      history.items.map((item) => item.generatedAt),
      ['2026-08-06T11:00:00.000Z', '2026-08-06T10:00:00.000Z'],
    );
  });
});

test('persiste entre instâncias diferentes do serviço', async () => {
  await withTempStateDir(async (stateDirectory) => {
    const first = new ProjectCoverageHistoryService(stateDirectory);
    await first.record('p1', makeSummary());

    const second = new ProjectCoverageHistoryService(stateDirectory);
    const history = await second.history('p1');
    assert.equal(history.total, 1);
  });
});
