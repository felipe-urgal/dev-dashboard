import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'vitest';

import {
  fetchAgentTaskPage,
  type AgentTaskPage,
  type AgentTaskRecord,
} from '../src/api/agent-runtime';
import { useAgentTaskHistory } from '../src/composables/useAgentTaskHistory';

interface Request {
  projectId: string;
  limit?: number;
  cursor?: string;
  resolve: (value: AgentTaskPage) => void;
  reject: (error: Error) => void;
}

function fakeTask(
  projectId: string,
  taskId: string,
  version = 0,
): AgentTaskRecord {
  return {
    task: {
      id: taskId,
      projectId,
      summary: 'Task ' + taskId,
      state: 'queued',
      createdAt: '2026-10-22T10:00:00.000Z',
      updatedAt: '2026-10-22T10:00:00.000Z',
      requestedCapabilities: [],
    },
    version,
  };
}

function client() {
  const requests: Request[] = [];
  const fetchPage: typeof fetchAgentTaskPage = (projectId, options = {}) =>
    new Promise((resolve, reject) => {
      requests.push({
        projectId,
        ...options,
        resolve,
        reject,
      });
    });
  return { requests, fetchPage };
}

test('primeira página limitada, cursor, dedupe e versão mais nova', async () => {
  const { requests, fetchPage } = client();
  const history = useAgentTaskHistory(() => 'project-a', fetchPage);
  const first = history.loadFirstPage();

  assert.deepEqual(
    { projectId: requests[0]!.projectId, limit: requests[0]!.limit },
    { projectId: 'project-a', limit: 20 },
  );
  requests[0]!.resolve({
    tasks: [fakeTask('project-a', 'task-1', 3)],
    nextCursor: 'a'.repeat(64),
  });
  await first;
  assert.equal(history.historyHasMore.value, true);
  history.upsertTask(fakeTask('project-b', 'foreign'));
  assert.equal(history.tasks.value.length, 1);

  const next = history.loadNextPage();
  assert.equal(requests[1]!.cursor, 'a'.repeat(64));
  const simultaneous = history.loadNextPage();
  assert.equal(requests.length, 2);
  requests[1]!.resolve({
    tasks: [
      fakeTask('project-a', 'task-1', 1),
      fakeTask('project-a', 'task-2'),
    ],
    nextCursor: null,
  });
  await Promise.all([next, simultaneous]);
  assert.deepEqual(history.tasks.value.map((item) => item.task.id).sort(), [
    'task-1',
    'task-2',
  ]);
  assert.equal(
    history.tasks.value.find((item) => item.task.id === 'task-1')?.version,
    3,
  );
  assert.equal(history.historyHasMore.value, false);
});

test('resposta A→B→A tardia não contamina o novo histórico', async () => {
  const project = { id: 'project-a' };
  const { requests, fetchPage } = client();
  const history = useAgentTaskHistory(() => project.id, fetchPage);
  const old = history.loadFirstPage();

  project.id = 'project-b';
  const other = history.loadFirstPage();
  project.id = 'project-a';
  const latest = history.loadFirstPage();

  requests[2]!.resolve({
    tasks: [fakeTask('project-a', 'latest')],
    nextCursor: null,
  });
  await latest;
  requests[0]!.resolve({
    tasks: [fakeTask('project-a', 'stale')],
    nextCursor: 'c'.repeat(64),
  });
  requests[1]!.reject(new Error('erro de outro projeto'));
  await Promise.all([old, other]);
  assert.deepEqual(
    history.tasks.value.map((item) => item.task.id),
    ['latest'],
  );
  assert.equal(history.historyError.value, '');
  assert.equal(history.historyLoading.value, false);
});

test('próxima página vazia pode continuar e erro preserva cursor para retry', async () => {
  const { requests, fetchPage } = client();
  const history = useAgentTaskHistory(() => 'project-a', fetchPage);
  const first = history.loadFirstPage();
  requests[0]!.resolve({ tasks: [], nextCursor: 'a'.repeat(64) });
  await first;

  const empty = history.loadNextPage();
  requests[1]!.resolve({ tasks: [], nextCursor: 'b'.repeat(64) });
  await empty;
  assert.equal(history.historyHasMore.value, true);

  const failed = history.loadNextPage();
  requests[2]!.reject(new Error('conexão indisponível'));
  await failed;
  assert.equal(history.nextCursor.value, 'b'.repeat(64));
  assert.match(history.historyError.value, /conexão indisponível/);

  const retry = history.loadNextPage();
  assert.equal(requests[3]!.cursor, 'b'.repeat(64));
  requests[3]!.resolve({
    tasks: [fakeTask('project-a', 'task-b')],
    nextCursor: null,
  });
  await retry;
  assert.equal(history.historyError.value, '');
  assert.equal(history.tasks.value.length, 1);
});

test('task selecionada pode ser incluída sem paginação e isolada por projeto', () => {
  const project = { id: 'project-a' };
  const history = useAgentTaskHistory(() => project.id, client().fetchPage);
  history.upsertTask(fakeTask('project-a', 'deep-link'));
  history.upsertTask(fakeTask('project-b', 'foreign'));
  assert.deepEqual(
    history.tasks.value.map((item) => item.task.id),
    ['deep-link'],
  );
  project.id = 'project-b';
  history.resetHistory();
  assert.equal(history.tasks.value.length, 0);
  assert.equal(history.historyLoaded.value, false);
});

test('cockpit não faz GET legado do histórico inteiro', () => {
  const panel = readFileSync(
    resolve(import.meta.dirname, '../src/components/ProjectAgentPanel.vue'),
    'utf8',
  );
  assert.match(panel, /useAgentTaskHistory/);
  assert.match(panel, /loadFirstPage\(\)/);
  assert.match(panel, /loadNextPage\(\)/);
  assert.match(panel, /props\.initialTaskId \|\| active\?\.task\.id/);
  assert.match(panel, /Carregar mais/);
  assert.doesNotMatch(panel, /fetchAgentTasks/);
});
