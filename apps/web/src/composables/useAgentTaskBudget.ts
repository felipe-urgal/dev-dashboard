import { computed, ref } from 'vue';

import {
  clearAgentBudget,
  fetchAgentBudget,
  setAgentBudget,
  type AgentBudgetOverview,
} from '../api/agent-runtime';

interface AgentBudgetTarget {
  projectId: string;
  taskId: string;
}

interface AgentBudgetClient {
  load: typeof fetchAgentBudget;
  save: typeof setAgentBudget;
  remove: typeof clearAgentBudget;
}

/**
 * Owns the budget inputs and last known budget for the selected task.
 * Responses from an earlier task, project, or request cannot replace this state.
 * Budget enforcement remains exclusively on the API.
 */
export function useAgentTaskBudget(
  currentTarget: () => AgentBudgetTarget | null,
  formatTokens: (value: number | undefined) => string,
  formatCost: (value: number | undefined) => string,
  client: AgentBudgetClient = {
    load: fetchAgentBudget,
    save: setAgentBudget,
    remove: clearAgentBudget,
  },
) {
  const budget = ref<AgentBudgetOverview | null>(null);
  const budgetTokens = ref('');
  const budgetCost = ref('');
  const budgetMode = ref<'soft' | 'hard'>('soft');
  let requestVersion = 0;

  const budgetAlertMessage = computed(() => {
    const alerts = budget.value?.alerts ?? [];
    if (!alerts.length) return '';
    return alerts
      .map((alert) =>
        alert.kind === 'total-tokens'
          ? `Limite de tokens atingido: ${formatTokens(alert.observed)} / ${formatTokens(alert.threshold)}`
          : `Limite de custo estimado atingido: ${formatCost(alert.observed)} / ${formatCost(alert.threshold)}`,
      )
      .join(' · ');
  });

  function applyBudget(next: AgentBudgetOverview): void {
    budget.value = next;
    budgetTokens.value =
      next.budget?.maxTotalTokens !== undefined
        ? String(next.budget.maxTotalTokens)
        : '';
    budgetCost.value =
      next.budget?.maxEstimatedCostUsd !== undefined
        ? String(next.budget.maxEstimatedCostUsd)
        : '';
    budgetMode.value = next.budget?.mode ?? 'soft';
  }

  function resetBudget(): void {
    requestVersion += 1;
    budget.value = null;
    budgetTokens.value = '';
    budgetCost.value = '';
    budgetMode.value = 'soft';
  }

  function captureRequest(): {
    projectId: string;
    taskId: string;
    version: number;
  } | null {
    const target = currentTarget();
    if (!target?.projectId || !target.taskId) return null;
    return {
      projectId: target.projectId,
      taskId: target.taskId,
      version: ++requestVersion,
    };
  }

  function isCurrent(request: {
    projectId: string;
    taskId: string;
    version: number;
  }): boolean {
    const target = currentTarget();
    return (
      request.version === requestVersion &&
      target?.projectId === request.projectId &&
      target.taskId === request.taskId
    );
  }

  async function runCurrent(
    request: NonNullable<ReturnType<typeof captureRequest>>,
    action: Promise<AgentBudgetOverview>,
  ): Promise<void> {
    try {
      const result = await action;
      if (isCurrent(request)) applyBudget(result);
    } catch (error) {
      if (isCurrent(request)) throw error;
    }
  }

  async function reloadBudget(): Promise<void> {
    const request = captureRequest();
    if (!request) return;
    await runCurrent(
      request,
      client.load(request.projectId, request.taskId),
    );
  }

  async function saveBudgetChanges(): Promise<void> {
    const request = captureRequest();
    if (!request) return;
    const maxTotalTokens = budgetTokens.value.trim()
      ? Number(budgetTokens.value)
      : undefined;
    const maxEstimatedCostUsd = budgetCost.value.trim()
      ? Number(budgetCost.value)
      : undefined;

    if (maxTotalTokens === undefined && maxEstimatedCostUsd === undefined) {
      throw new Error('Informe pelo menos um limite de budget.');
    }

    await runCurrent(
      request,
      client.save(request.projectId, request.taskId, {
        ...(maxTotalTokens !== undefined ? { maxTotalTokens } : {}),
        ...(maxEstimatedCostUsd !== undefined ? { maxEstimatedCostUsd } : {}),
        mode: budgetMode.value,
      }),
    );
  }

  async function clearBudgetChanges(): Promise<void> {
    const request = captureRequest();
    if (!request) return;
    await runCurrent(
      request,
      client.remove(request.projectId, request.taskId),
    );
  }

  return {
    budget,
    budgetTokens,
    budgetCost,
    budgetMode,
    budgetAlertMessage,
    resetBudget,
    reloadBudget,
    saveBudgetChanges,
    clearBudgetChanges,
  };
}
