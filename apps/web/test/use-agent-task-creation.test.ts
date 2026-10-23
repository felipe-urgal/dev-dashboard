import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ref } from 'vue';
import { test } from 'vitest';

import {
  type AgentBacklogAdoptionResult,
  type AgentTaskRecord,
  type adoptAgentBacklog,
  type createAgentTask,
} from '../src/api/agent-runtime';
import { useAgentTaskCreation, parseAgentBacklogInstruction } from '../src/composables/useAgentTaskCreation';
import { type fetchTaskContexts } from '../src/api/task-contexts';

function record(projectId: string, taskId = 'task-1'): AgentTaskRecord {
  return {
    task: {
      id: taskId,
      projectId,
      state: 'queued',
      summary: 'Task descartável',
      requestedCapabilities: ['workspace:write'],
      createdAt: '2026-10-23T10:00:00.000Z',
      updatedAt: '2026-10-23T10:00:00.000Z',
    },
    version: 1,
  };
}

const issue = {
  repository: 'example/repo',
  number: 123,
  title: 'Issue de teste',
  labels: [],
};

function harness() {
  const target = {
    projectId: 'project-a',
    environmentInstanceId: 'env-a',
    taskContextId: 'context-a',
    requestedCapabilities: ['workspace:write' as const],
  };
  const mutating = ref(false);
  const creates: Array<{
    projectId: string;
    input: Parameters<typeof createAgentTask>[1];
    resolve: (value: AgentTaskRecord) => void;
    reject: (error: Error) => void;
  }> = [];
  const adoptions: Array<{
    projectId: string;
    input: Parameters<typeof adoptAgentBacklog>[1];
    resolve: (value: AgentBacklogAdoptionResult) => void;
    reject: (error: Error) => void;
  }> = [];
  const contexts: Array<{
    projectId: string;
    resolve: (value: Awaited<ReturnType<typeof fetchTaskContexts>>) => void;
  }> = [];
  const committed: string[] = [];
  const notices: string[] = [];
  const reloaded: string[] = [];
  const errors: string[] = [];
  let cleared = 0;
  const state = useAgentTaskCreation(
    () => target,
    mutating,
    ({ record: value, adoption, contexts: list }) => {
      committed.push(value.task.id);
      if (adoption) {
        notices.push(adoption.issue.number + ':' + String(list?.length));
        target.taskContextId = value.task.taskContextId ?? '';
      }
    },
    async (taskId) => {
      reloaded.push(taskId);
    },
    (message) => errors.push(message),
    () => {
      cleared += 1;
    },
    {
      create: (projectId, input) =>
        new Promise((resolve, reject) =>
          creates.push({ projectId, input, resolve, reject }),
        ),
      adopt: (projectId, input) =>
        new Promise((resolve, reject) =>
          adoptions.push({ projectId, input, resolve, reject }),
        ),
      fetchContexts: (projectId) =>
        new Promise((resolve) => contexts.push({ projectId, resolve })),
    },
  );
  return {
    target,
    mutating,
    state,
    creates,
    adoptions,
    contexts,
    committed,
    notices,
    reloaded,
    errors,
    cleared: () => cleared,
  };
}

test('intenção de backlog reconhece variações e issue explícita sem falsa adoção', () => {
  assert.deepEqual(parseAgentBacklogInstruction('  Pegue a PRÓXIMA atividade '), {});
  assert.deepEqual(parseAgentBacklogInstruction('pegue a proxima issue'), {});
  assert.deepEqual(parseAgentBacklogInstruction(' pegue  a #123 '), { issueNumber: 123 });
  assert.equal(parseAgentBacklogInstruction('pegue a #0'), null);
  assert.equal(parseAgentBacklogInstruction('pegue a #99999999999999999999'), null);
  assert.equal(parseAgentBacklogInstruction('crie uma task comum'), null);
});

test('criação captura projeto, contexto, capabilities e texto antes da requisição', async () => {
  const h = harness();
  h.state.instruction.value = '  tarefa nova  ';
  const pending = h.state.createTask();
  h.target.requestedCapabilities.push('git:commit' as never);
  h.state.instruction.value = 'rascunho posterior';
  await h.state.createTask();
  assert.equal(h.creates.length, 1);
  assert.equal(h.mutating.value, true);
  assert.deepEqual(h.creates[0]?.input, {
    summary: 'tarefa nova',
    taskContextId: 'context-a',
    requestedCapabilities: ['workspace:write'],
  });
  h.creates[0]!.resolve(record('project-a'));
  await pending;
  assert.deepEqual(h.committed, ['task-1']);
  assert.deepEqual(h.reloaded, ['task-1']);
  assert.equal(h.state.instruction.value, '');
  assert.equal(h.mutating.value, false);
  assert.equal(h.cleared(), 1);
});

test('adoção ambígua não cria seleção; issue escolhida usa ambiente e busca contextos', async () => {
  const h = harness();
  h.state.instruction.value = 'pegue a próxima atividade';
  const ambiguous = h.state.createTask();
  h.adoptions[0]!.resolve({
    status: 'ambiguous',
    source: 'priority-tie',
    candidates: [issue],
    reused: false,
  });
  await ambiguous;
  assert.deepEqual(h.state.backlogCandidates.value, [issue]);
  assert.equal(h.state.backlogSelectionSource.value, 'priority-tie');
  assert.deepEqual(h.committed, []);
  h.state.chooseBacklogIssue(issue);
  const pending = h.state.createTask();
  assert.deepEqual(h.adoptions[1]?.input, {
    issueNumber: 123,
    environmentInstanceId: 'env-a',
    requestedCapabilities: ['workspace:write'],
  });
  h.adoptions[1]!.resolve({
    status: 'adopted',
    source: 'specific-issue',
    issue,
    candidates: [],
    reused: true,
    task: { ...record('project-a'), task: { ...record('project-a').task, taskContextId: 'context-new' } },
  });
  await Promise.resolve();
  assert.equal(h.contexts[0]?.projectId, 'project-a');
  assert.deepEqual(h.committed, []);
  h.contexts[0]!.resolve([]);
  await pending;
  assert.deepEqual(h.committed, ['task-1']);
  assert.deepEqual(h.reloaded, ['task-1'], 'context selection does not prevent reloading adopted task');
  assert.deepEqual(h.notices, ['123:0']);
  assert.equal(h.state.backlogAdoptionNotice.value?.reused, true);
  assert.deepEqual(h.state.backlogCandidates.value, []);
});

test('A → B → A descarta resposta tardia sem liberar lock ou sobrescrever draft', async () => {
  const h = harness();
  h.state.instruction.value = 'task antiga';
  const old = h.state.createTask();
  h.target.projectId = 'project-b';
  h.state.resetCreation();
  h.target.projectId = 'project-a';
  h.state.resetCreation();
  h.state.instruction.value = 'task nova';
  await h.state.createTask();
  assert.equal(h.creates.length, 1, 'request em andamento mantém lock');
  h.creates[0]!.resolve(record('project-a'));
  await old;
  assert.deepEqual(h.committed, []);
  assert.deepEqual(h.reloaded, []);
  assert.equal(h.state.instruction.value, 'task nova');
  assert.equal(h.mutating.value, false);
  const next = h.state.createTask();
  assert.equal(h.creates.length, 2);
  h.creates[1]!.resolve(record('project-a', 'task-2'));
  await next;
  assert.deepEqual(h.committed, ['task-2']);
});

test('troca de task/contexto invalida adoção pendente antes de aplicar contextos', async () => {
  const h = harness();
  h.state.instruction.value = 'pegue a #123';
  const pending = h.state.createTask();
  h.adoptions[0]!.resolve({
    status: 'adopted',
    source: 'specific-issue',
    issue,
    candidates: [],
    reused: false,
    task: record('project-a'),
  });
  await Promise.resolve();
  h.state.invalidateCreation();
  h.target.taskContextId = 'context-b';
  h.contexts[0]!.resolve([]);
  await pending;
  assert.deepEqual(h.committed, []);
  assert.deepEqual(h.reloaded, []);
  assert.equal(h.state.backlogAdoptionNotice.value, null);
});

test('erro antigo e resposta com outro projeto falham fechado, sem reenvio', async () => {
  const h = harness();
  h.state.instruction.value = 'task antiga';
  const stale = h.state.createTask();
  h.target.projectId = 'project-b';
  h.state.resetCreation();
  h.creates[0]!.reject(new Error('internal stale error'));
  await stale;
  assert.deepEqual(h.errors, []);
  h.state.instruction.value = 'task atual';
  const wrong = h.state.createTask();
  h.creates[1]!.resolve(record('project-a'));
  await wrong;
  assert.match(h.errors[0] ?? '', /não corresponde/);
  assert.deepEqual(h.committed, []);
  assert.equal(h.creates.length, 2);
});

test('cockpit delega criação e invalida resultados ao navegar e desmontar', () => {
  const panel = readFileSync(
    resolve(import.meta.dirname, '../src/components/ProjectAgentPanel.vue'),
    'utf8',
  );
  assert.match(panel, /useAgentTaskCreation\(/);
  assert.match(panel, /invalidateCreation\(\)/);
  assert.match(panel, /resetCreation\(\)/);
  assert.match(panel, /@click="createTask"/);
  assert.doesNotMatch(panel, /async function createTask\(/);
  assert.doesNotMatch(panel, /adoptAgentBacklog\(/);
});
