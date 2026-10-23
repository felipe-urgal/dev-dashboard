import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ref } from 'vue';
import { test } from 'vitest';

import {
  type AgentTaskRecord,
  type AgentTaskState,
  type archiveAgentTask,
} from '../src/api/agent-runtime';
import { useAgentTaskArchive } from '../src/composables/useAgentTaskArchive';

function record(
  projectId = 'project-a',
  taskId = 'task-a',
  archived = true,
): AgentTaskRecord {
  return {
    task: {
      id: taskId,
      projectId,
      state: 'completed',
      summary: 'Concluída',
      requestedCapabilities: [],
      createdAt: '2026-10-23T10:00:00.000Z',
      updatedAt: '2026-10-23T11:00:00.000Z',
      ...(archived ? { archivedAt: '2026-10-23T11:10:00.000Z' } : {}),
    },
    version: 2,
  };
}

function harness() {
  const target = {
    projectId: 'project-a',
    taskId: 'task-a',
    state: 'completed' as AgentTaskState,
    archived: false,
    activeExecution: false,
  };
  const mutating = ref(false);
  const requests: Array<{
    projectId: string;
    taskId: string;
    resolve: (record: AgentTaskRecord) => void;
    reject: (error: Error) => void;
  }> = [];
  const applied: string[] = [];
  const refreshes: string[] = [];
  const reloads: string[] = [];
  const errors: string[] = [];
  let clears = 0;

  const archive: typeof archiveAgentTask = (projectId, taskId) =>
    new Promise((resolve, reject) =>
      requests.push({ projectId, taskId, resolve, reject }),
    );
  const state = useAgentTaskArchive(
    () => target,
    mutating,
    (archived) => {
      applied.push(archived.task.id);
      target.archived = Boolean(archived.task.archivedAt);
    },
    async () => {
      refreshes.push(target.taskId);
    },
    async (taskId) => {
      reloads.push(taskId);
    },
    (message) => errors.push(message),
    () => {
      clears += 1;
    },
    { archive },
  );
  return {
    target,
    mutating,
    requests,
    applied,
    refreshes,
    reloads,
    errors,
    state,
    clears: () => clears,
  };
}

test('arquiva somente task concluída e atual, sem fazer segunda requisição', async () => {
  const h = harness();
  const pending = h.state.archiveCurrent();
  await h.state.archiveCurrent();
  assert.equal(h.requests.length, 1);
  assert.deepEqual(
    [h.requests[0]?.projectId, h.requests[0]?.taskId],
    ['project-a', 'task-a'],
  );
  assert.equal(h.mutating.value, true);
  h.requests[0]!.resolve(record());
  await pending;
  assert.deepEqual(h.applied, ['task-a']);
  assert.deepEqual(h.refreshes, ['task-a']);
  assert.deepEqual(h.reloads, []);
  assert.deepEqual(h.errors, []);
  assert.equal(h.clears(), 1);
  assert.equal(h.mutating.value, false);
  await h.state.archiveCurrent();
  assert.equal(h.requests.length, 1);
});

test('não arquiva task não finalizada, já arquivada, ativa ou com outra mutação', async () => {
  const h = harness();
  for (const state of [
    'queued',
    'running',
    'review',
    'checkpoint',
    'failed',
    'blocked',
  ] as AgentTaskState[]) {
    h.target.state = state;
    await h.state.archiveCurrent();
  }
  h.target.state = 'completed';
  h.target.activeExecution = true;
  await h.state.archiveCurrent();
  h.target.activeExecution = false;
  h.target.archived = true;
  await h.state.archiveCurrent();
  h.target.archived = false;
  h.mutating.value = true;
  await h.state.archiveCurrent();
  assert.deepEqual(h.requests, []);
  h.mutating.value = false;
  h.target.state = 'cancelled';
  const pending = h.state.archiveCurrent();
  assert.equal(h.requests.length, 1, 'cancelled também é elegível');
  h.requests[0]!.resolve(record());
  await pending;
});

test('seleção A → B → A invalida sucesso antigo e mantém lock até terminar', async () => {
  const h = harness();
  const old = h.state.archiveCurrent();
  h.target.taskId = 'task-b';
  h.state.invalidateArchive();
  h.target.taskId = 'task-a';
  h.state.invalidateArchive();
  await h.state.archiveCurrent();
  assert.equal(
    h.requests.length,
    1,
    'nenhum segundo archive durante primeiro voo',
  );
  h.requests[0]!.resolve(record());
  await old;
  assert.deepEqual(h.applied, []);
  assert.deepEqual(h.refreshes, []);
  assert.deepEqual(h.reloads, []);
  assert.equal(h.target.archived, false);
  assert.equal(h.mutating.value, false);
  const newer = h.state.archiveCurrent();
  assert.equal(h.requests.length, 2);
  h.requests[1]!.resolve(record());
  await newer;
  assert.deepEqual(h.applied, ['task-a']);
});

test('erro antigo após troca de projeto e unmount não contamina seleção', async () => {
  const h = harness();
  const old = h.state.archiveCurrent();
  h.target.projectId = 'project-b';
  h.state.invalidateArchive();
  h.requests[0]!.reject(new Error('erro privado de outra task'));
  await old;
  assert.deepEqual(h.errors, []);
  assert.deepEqual(h.reloads, []);
  assert.equal(h.mutating.value, false);

  h.target.projectId = 'project-a';
  const second = h.state.archiveCurrent();
  h.state.invalidateArchive();
  h.requests[1]!.resolve(record());
  await second;
  assert.deepEqual(h.applied, []);
});

test('resposta de outra task, outro projeto ou sem archive confirmado falha fechado', async () => {
  const h = harness();
  const malformed = [
    record('project-b'),
    record('project-a', 'task-b'),
    record('project-a', 'task-a', false),
  ];
  for (const response of malformed) {
    const pending = h.state.archiveCurrent();
    h.requests.at(-1)!.resolve(response);
    await pending;
  }
  assert.deepEqual(h.applied, []);
  assert.deepEqual(h.refreshes, []);
  assert.equal(h.errors.length, 3);
  assert.deepEqual(h.reloads, ['task-a', 'task-a', 'task-a']);
  assert.equal(
    h.requests.length,
    3,
    'resposta inconsistente não dispara retry',
  );
});

test('falha ambígua reconcilia a task canônica sem repetir POST', async () => {
  const h = harness();
  const pending = h.state.archiveCurrent();
  h.requests[0]!.reject(new Error('Conexão encerrada'));
  await pending;
  assert.deepEqual(h.errors, ['Conexão encerrada']);
  assert.deepEqual(h.reloads, ['task-a']);
  assert.deepEqual(h.applied, []);
  assert.equal(h.requests.length, 1);
  assert.equal(h.mutating.value, false);
});

test('cockpit delega archive e invalida ao selecionar task, trocar projeto e desmontar', () => {
  const panel = readFileSync(
    resolve(import.meta.dirname, '../src/components/ProjectAgentPanel.vue'),
    'utf8',
  );
  assert.match(panel, /useAgentTaskArchive\(/);
  assert.match(panel, /invalidateArchive\(\)/);
  assert.match(panel, /@click="archiveCurrent"/);
  assert.doesNotMatch(panel, /async function archiveCurrent\(/);
  assert.doesNotMatch(panel, /archiveAgentTask\(/);
});
