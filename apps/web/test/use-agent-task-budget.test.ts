import assert from 'node:assert/strict';
import { test } from 'vitest';

import {
  type AgentBudgetOverview,
  type setAgentBudget,
} from '../src/api/agent-runtime';
import { useAgentTaskBudget } from '../src/composables/useAgentTaskBudget';

interface PendingRequest {
  projectId: string;
  taskId: string;
  resolve: (overview: AgentBudgetOverview) => void;
  reject: (error: Error) => void;
}

interface PendingSave extends PendingRequest {
  input: Parameters<typeof setAgentBudget>[2];
}

function overview(
  projectId: string,
  taskId: string,
  maxTotalTokens?: number,
): AgentBudgetOverview {
  return {
    budget:
      maxTotalTokens === undefined
        ? null
        : {
            projectId,
            taskId,
            maxTotalTokens,
            mode: 'hard',
            updatedAt: '2026-10-22T12:00:00.000Z',
          },
    usage: { executionCount: 0 },
    alerts: [],
    blocking: maxTotalTokens === 10,
  };
}

function createClient() {
  const loads: PendingRequest[] = [];
  const saves: PendingSave[] = [];
  const removals: PendingRequest[] = [];
  return {
    loads,
    saves,
    removals,
    api: {
      load: (projectId: string, taskId: string) =>
        new Promise<AgentBudgetOverview>((resolve, reject) => {
          loads.push({ projectId, taskId, resolve, reject });
        }),
      save: (
        projectId: string,
        taskId: string,
        input: Parameters<typeof setAgentBudget>[2],
      ) =>
        new Promise<AgentBudgetOverview>((resolve, reject) => {
          saves.push({ projectId, taskId, input, resolve, reject });
        }),
      remove: (projectId: string, taskId: string) =>
        new Promise<AgentBudgetOverview>((resolve, reject) => {
          removals.push({ projectId, taskId, resolve, reject });
        }),
    },
  };
}

function budgetTokens(state: ReturnType<typeof useAgentTaskBudget>) {
  return state.budget.value?.budget?.maxTotalTokens;
}

function setup(target: () => { projectId: string; taskId: string } | null) {
  const client = createClient();
  const state = useAgentTaskBudget(
    target,
    (value) => (value === undefined ? '—' : String(value)),
    (value) => (value === undefined ? '—' : 'US$ ' + value.toFixed(2)),
    client.api,
  );
  return { ...client, state };
}

test('loads antigos A → B → A não sobrescrevem budget da task atual', async () => {
  const target = { projectId: 'project-a', taskId: 'task-a' };
  const { loads, state } = setup(() => target);

  const first = state.reloadBudget();
  target.taskId = 'task-b';
  state.resetBudget();
  const second = state.reloadBudget();
  target.taskId = 'task-a';
  state.resetBudget();
  const latest = state.reloadBudget();

  loads[2]!.resolve(overview('project-a', 'task-a', 30));
  await latest;
  loads[0]!.resolve(overview('project-a', 'task-a', 10));
  loads[1]!.resolve(overview('project-a', 'task-b', 20));
  await Promise.all([first, second]);

  assert.equal(budgetTokens(state), 30);
  assert.equal(state.budgetTokens.value, '30');
  assert.equal(state.budgetMode.value, 'hard');
  assert.equal(state.budget.value?.blocking, false);
});

test('salvar limita somente a task capturada, sem repopular seleção nova', async () => {
  const target = { projectId: 'project-a', taskId: 'task-a' };
  const { state, saves } = setup(() => target);
  state.budgetTokens.value = '500';
  state.budgetCost.value = '1.50';
  state.budgetMode.value = 'hard';

  const save = state.saveBudgetChanges();
  assert.equal(saves.length, 1);
  assert.equal(saves[0]!.projectId, 'project-a');
  assert.equal(saves[0]!.taskId, 'task-a');
  assert.deepEqual(saves[0]!.input, {
    maxTotalTokens: 500,
    maxEstimatedCostUsd: 1.5,
    mode: 'hard',
  });

  target.taskId = 'task-b';
  state.resetBudget();
  saves[0]!.resolve(overview('project-a', 'task-a', 500));
  await save;

  assert.equal(state.budget.value, null);
  assert.equal(state.budgetTokens.value, '');
  assert.equal(state.budgetCost.value, '');
  assert.equal(state.budgetMode.value, 'soft');
});

test('limpeza da task não herda remoção tardia; erro stale é ignorado', async () => {
  const target = { projectId: 'project-a', taskId: 'task-a' };
  const { state, removals } = setup(() => target);
  const old = state.clearBudgetChanges();
  target.projectId = 'project-b';
  state.resetBudget();

  removals[0]!.reject(new Error('erro de projeto antigo'));
  await assert.doesNotReject(old);
  assert.equal(state.budget.value, null);

  const current = state.clearBudgetChanges();
  removals[1]!.reject(new Error('erro atual'));
  await assert.rejects(current, /erro atual/);
});

test('aplica budget novo, mantém blocking, alertas e valida campos', async () => {
  const { state, loads, saves, removals } = setup(() => ({
    projectId: 'project-a',
    taskId: 'task-a',
  }));

  await assert.rejects(state.saveBudgetChanges(), /Informe pelo menos/);
  assert.equal(saves.length, 0);

  const first = state.reloadBudget();
  const blocking: AgentBudgetOverview = {
    ...overview('project-a', 'task-a', 10),
    alerts: [{ kind: 'total-tokens', observed: 10, threshold: 10 }],
  };
  loads[0]!.resolve(blocking);
  await first;
  assert.equal(state.budget.value?.blocking, true);
  assert.match(state.budgetAlertMessage.value, /Limite de tokens atingido: 10/);

  const remove = state.clearBudgetChanges();
  removals[0]!.resolve(overview('project-a', 'task-a'));
  await remove;
  assert.equal(state.budget.value?.blocking, false);
  assert.equal(state.budgetTokens.value, '');
  assert.equal(state.budgetMode.value, 'soft');
});
