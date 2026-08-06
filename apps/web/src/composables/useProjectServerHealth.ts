import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue';

import type {
  ManagedProcessStatus,
  ProjectServerHealth,
} from '@dev-dashboard/contracts';

import { fetchProjectServerHealth } from '../api';
import { RequestGeneration } from '../utils/request-generation';

const HEALTH_POLL_INTERVAL_MS = 15_000;

export function useProjectServerHealth(
  getProjectId: () => string,
  processStatus: Ref<ManagedProcessStatus>,
) {
  const health = ref<ProjectServerHealth | null>(null);
  const loadingHealth = ref(false);
  const healthError = ref('');
  const requests = new RequestGeneration();
  let pollTimer: ReturnType<typeof setTimeout> | undefined;

  const healthLabel = computed(() => {
    if (loadingHealth.value && !health.value) return 'Verificando';

    switch (health.value?.status) {
      case 'healthy':
        return 'Saudável';
      case 'degraded':
        return 'Degradado';
      case 'unavailable':
        return 'Indisponível';
      default:
        return 'Aguardando';
    }
  });

  const healthCheckedAtLabel = computed(() => {
    if (!health.value?.checkedAt) return '—';

    const date = new Date(health.value.checkedAt);
    if (Number.isNaN(date.getTime())) return '—';

    return new Intl.DateTimeFormat('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(date);
  });

  function clearTimer(): void {
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = undefined;
  }

  function schedulePolling(): void {
    clearTimer();

    if (processStatus.value !== 'running') return;

    pollTimer = setTimeout(() => {
      void refreshHealth();
    }, HEALTH_POLL_INTERVAL_MS);
  }

  async function refreshHealth(): Promise<void> {
    if (processStatus.value !== 'running') {
      health.value = null;
      return;
    }

    const projectId = getProjectId();
    const generation = requests.capture();
    loadingHealth.value = true;
    healthError.value = '';

    try {
      const result = await fetchProjectServerHealth(projectId);

      if (getProjectId() === projectId && requests.isCurrent(generation)) {
        health.value = result;
      }
    } catch (error) {
      if (getProjectId() === projectId && requests.isCurrent(generation)) {
        healthError.value =
          error instanceof Error
            ? error.message
            : 'Não foi possível verificar a saúde do servidor.';
      }
    } finally {
      if (getProjectId() === projectId && requests.isCurrent(generation)) {
        loadingHealth.value = false;
        schedulePolling();
      }
    }
  }

  function resetHealth(): void {
    requests.invalidate();
    clearTimer();
    health.value = null;
    loadingHealth.value = false;
    healthError.value = '';
  }

  watch(processStatus, (status) => {
    if (status === 'running') {
      void refreshHealth();
    } else {
      resetHealth();
    }
  });

  watch(getProjectId, () => {
    resetHealth();

    if (processStatus.value === 'running') {
      void refreshHealth();
    }
  });

  onBeforeUnmount(resetHealth);

  return {
    health,
    healthError,
    healthCheckedAtLabel,
    healthLabel,
    loadingHealth,
    refreshHealth,
    resetHealth,
  };
}
