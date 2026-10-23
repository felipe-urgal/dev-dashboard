import { computed, ref } from 'vue';

type SupplementalSource = 'budget' | 'usage';

interface TaskTarget {
  projectId: string;
  taskId: string;
}

/**
 * Budget/usage observations must never gate loading the canonical Agent Task.
 * Each optional request reports its own failure without leaking provider data,
 * and navigation invalidates errors from earlier requests (including A→B→A).
 * The existing budget and usage composables own their actual data and guards.
 */
export function useAgentTaskSupplementalData(
  currentTarget: () => TaskTarget | null,
  reloadBudget: () => Promise<void>,
  reloadUsage: () => Promise<void>,
) {
  const failedSources = ref<SupplementalSource[]>([]);
  let version = 0;

  const supplementalWarning = computed(() => {
    if (failedSources.value.length === 2) {
      return 'Budget e usage indisponíveis. Estado da task carregado normalmente; consulte os dados novamente.';
    }
    if (failedSources.value.includes('budget')) {
      return 'Não foi possível consultar o budget. Limites e bloqueios exibidos podem estar desatualizados.';
    }
    if (failedSources.value.includes('usage')) {
      return 'Não foi possível consultar o usage. Métricas da task indisponíveis.';
    }
    return '';
  });

  function resetSupplementalData(): void {
    version += 1;
    failedSources.value = [];
  }

  function loadSupplementalData(): void {
    resetSupplementalData();
    const target = currentTarget();
    if (!target?.projectId || !target.taskId) return;

    const requestVersion = version;
    const isCurrent = () => {
      const selected = currentTarget();
      return (
        requestVersion === version &&
        selected?.projectId === target.projectId &&
        selected.taskId === target.taskId
      );
    };

    function markFailure(source: SupplementalSource): void {
      if (isCurrent() && !failedSources.value.includes(source)) {
        failedSources.value = [...failedSources.value, source];
      }
    }

    // Deliberately not awaited: a failed or stalled observation must not
    // prevent status, conversation, attachments and WebSocket from loading.
    void Promise.resolve().then(reloadBudget).catch(() => markFailure('budget'));
    void Promise.resolve().then(reloadUsage).catch(() => markFailure('usage'));
  }

  return {
    failedSources,
    supplementalWarning,
    resetSupplementalData,
    loadSupplementalData,
  };
}
