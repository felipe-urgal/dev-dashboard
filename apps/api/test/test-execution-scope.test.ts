import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { ManagedProcess } from '@dev-dashboard/contracts';

import { TestExecutionHistoryService } from '../src/services/test-execution-history-service.js';

function processManagerWithoutActiveTest() {
  return {
    getTestProcess: async () => null,
    readTestLog: async () => {
      throw new Error('log não esperado neste teste');
    },
  };
}

function finishedProcess(
  id: string,
  args: string[] = ['run', 'test'],
): ManagedProcess {
  return {
    id,
    projectId: 'p1',
    kind: 'test',
    status: 'stopped',
    command: 'npm',
    args,
    startedAt: '2026-09-05T12:00:00.000Z',
    stoppedAt: '2026-09-05T12:00:01.000Z',
    exitCode: 0,
  };
}

test('persiste full-suite e targeted como escopos explícitos', async (context) => {
  const stateDirectory = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-test-scope-'),
  );
  context.after(async () => {
    await rm(stateDirectory, { recursive: true, force: true });
  });

  const service = new TestExecutionHistoryService(
    processManagerWithoutActiveTest(),
    stateDirectory,
  );

  await service.recordStart('p1', finishedProcess('node-script-test'));
  await service.recordStart(
    'p1',
    finishedProcess('node-script-test:file', [
      'run',
      'test',
      '--',
      'src/app.test.ts',
    ]),
  );

  const history = await service.history('p1');
  assert.equal(history.items[0]?.scope, 'targeted');
  assert.equal(history.items[0]?.targetFile, 'src/app.test.ts');
  assert.equal(history.items[1]?.scope, 'full-suite');
  assert.equal(history.items[1]?.targetFile, undefined);
});

test('migra em leitura histórico v1 sem scope sem perder registros', async (context) => {
  const stateDirectory = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-test-scope-v1-'),
  );
  context.after(async () => {
    await rm(stateDirectory, { recursive: true, force: true });
  });

  const historyDirectory = path.join(stateDirectory, 'tests-history');
  await mkdir(historyDirectory, { recursive: true });
  await writeFile(
    path.join(historyDirectory, 'legacy.json'),
    JSON.stringify({
      version: 1,
      items: [
        {
          id: 'targeted-v1',
          projectId: 'legacy',
          commandId: 'test',
          targetFile: 'src/legacy.test.ts',
          status: 'stopped',
          startedAt: '2026-09-04T10:00:00.000Z',
          finishedAt: '2026-09-04T10:00:01.000Z',
          exitCode: 0,
        },
        {
          id: 'full-v1',
          projectId: 'legacy',
          commandId: 'test',
          status: 'stopped',
          startedAt: '2026-09-04T09:00:00.000Z',
          finishedAt: '2026-09-04T09:00:01.000Z',
          exitCode: 0,
        },
      ],
    }),
  );

  const service = new TestExecutionHistoryService(
    processManagerWithoutActiveTest(),
    stateDirectory,
  );
  const history = await service.history('legacy');

  assert.equal(history.total, 2);
  assert.equal(history.items[0]?.scope, 'targeted');
  assert.equal(history.items[1]?.scope, 'full-suite');
});
