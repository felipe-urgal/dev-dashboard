import { computed, ref } from 'vue';

import { fetchAgentUsage, type AgentUsageOverview } from '../api/agent-runtime';

export type AgentUsagePeriod = 'all' | '24h' | '7d' | '30d';

interface AgentUsageTarget {
  projectId: string;
  taskId: string;
}

/** One usage snapshot for the task and period currently selected by the cockpit. */
export function useAgentTaskUsage(
  currentTarget: () => AgentUsageTarget | null,
  loadUsage: typeof fetchAgentUsage = fetchAgentUsage,
) {
  const usage = ref<AgentUsageOverview | null>(null);
  const usagePeriod = ref<AgentUsagePeriod>('all');
  let requestVersion = 0;

  const usageHasMetrics = computed(() => {
    const summary = usage.value?.total;
    if (!summary) return false;
    return (
      summary.inputTokens !== undefined ||
      summary.cachedInputTokens !== undefined ||
      summary.cacheWriteInputTokens !== undefined ||
      summary.outputTokens !== undefined ||
      summary.reasoningTokens !== undefined ||
      summary.totalTokens !== undefined ||
      summary.reportedCostUsd !== undefined ||
      summary.estimatedCostUsd !== undefined ||
      summary.durationMs !== undefined
    );
  });

  function clearUsage(): void {
    requestVersion += 1;
    usage.value = null;
  }

  function usagePeriodRange(period: AgentUsagePeriod): {
    observedFrom?: string;
  } {
    if (period === 'all') return {};
    const hours = period === '24h' ? 24 : period === '7d' ? 168 : 720;
    return {
      observedFrom: new Date(Date.now() - hours * 60 * 60 * 1000).toISOString(),
    };
  }

  async function reloadUsage(): Promise<void> {
    const target = currentTarget();
    clearUsage();
    if (!target?.projectId || !target.taskId) return;

    const { projectId, taskId } = target;
    const period = usagePeriod.value;
    const currentRequest = requestVersion;
    const stillCurrent = () => {
      const selected = currentTarget();
      return (
        currentRequest === requestVersion &&
        selected?.projectId === projectId &&
        selected.taskId === taskId &&
        usagePeriod.value === period
      );
    };

    try {
      const result = await loadUsage(
        projectId,
        taskId,
        usagePeriodRange(period),
      );
      if (stillCurrent()) usage.value = result;
    } catch (error) {
      if (stillCurrent()) throw error;
    }
  }

  return {
    usage,
    usagePeriod,
    usageHasMetrics,
    clearUsage,
    reloadUsage,
  };
}
