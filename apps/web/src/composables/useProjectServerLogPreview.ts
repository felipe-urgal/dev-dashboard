import { onBeforeUnmount, ref, watch, type ComputedRef, type Ref } from 'vue';

import type { ProcessLogSnapshot, Project } from '@dev-dashboard/contracts';

import { fetchProjectProcessLog } from '../api';
import { RequestGate, RequestGeneration } from '../utils/request-generation';

export function useProjectServerLogPreview(
  getProject: () => Project,
  hasManagedProcess: Ref<boolean> | ComputedRef<boolean>,
) {
  const logSnapshot = ref<ProcessLogSnapshot | null>(null);
  const loadingLogs = ref(false);
  const logErrorMessage = ref('');

  const projectRequests = new RequestGeneration();
  const logRequests = new RequestGeneration();
  const logRequestGate = new RequestGate();
  let logPollingTimer: ReturnType<typeof setTimeout> | undefined;

  function isCurrentProject(projectId: string, generation: number): boolean {
    return (
      getProject().id === projectId && projectRequests.isCurrent(generation)
    );
  }

  async function refreshLogs(): Promise<void> {
    if (!hasManagedProcess.value) return;

    const requestToken = logRequestGate.begin('server-log-preview');
    if (!requestToken) return;

    const projectId = getProject().id;
    const generation = projectRequests.capture();
    const logGeneration = logRequests.capture();
    loadingLogs.value = true;
    logErrorMessage.value = '';

    try {
      const snapshot = await fetchProjectProcessLog(projectId, 24_576);
      if (
        isCurrentProject(projectId, generation) &&
        logRequests.isCurrent(logGeneration)
      ) {
        logSnapshot.value = snapshot;
      }
    } catch (error) {
      if (
        isCurrentProject(projectId, generation) &&
        logRequests.isCurrent(logGeneration)
      ) {
        logErrorMessage.value =
          error instanceof Error
            ? error.message
            : 'Não foi possível carregar os logs.';
      }
    } finally {
      if (
        logRequestGate.finish(requestToken) &&
        isCurrentProject(projectId, generation)
      ) {
        loadingLogs.value = false;
      }
    }
  }

  function stopLogPolling(): void {
    if (logPollingTimer) {
      clearTimeout(logPollingTimer);
      logPollingTimer = undefined;
    }
  }

  function scheduleLogPolling(): void {
    stopLogPolling();
    if (!hasManagedProcess.value) return;

    const generation = projectRequests.capture();
    logPollingTimer = setTimeout(async () => {
      await refreshLogs();

      if (projectRequests.isCurrent(generation) && hasManagedProcess.value) {
        scheduleLogPolling();
      }
    }, 2_500);
  }

  function reset(): void {
    stopLogPolling();
    projectRequests.invalidate();
    logRequests.invalidate();
    logRequestGate.invalidate();
    logSnapshot.value = null;
    loadingLogs.value = false;
    logErrorMessage.value = '';
  }

  watch(
    () => getProject().id,
    () => {
      reset();
    },
    { immediate: true },
  );

  watch(
    hasManagedProcess,
    (available) => {
      if (!available) {
        stopLogPolling();
        return;
      }

      void refreshLogs().then(scheduleLogPolling);
    },
    { immediate: true },
  );

  onBeforeUnmount(() => {
    projectRequests.invalidate();
    logRequests.invalidate();
    logRequestGate.invalidate();
    stopLogPolling();
  });

  return {
    logSnapshot,
    loadingLogs,
    logErrorMessage,
    refreshLogs,
    scheduleLogPolling,
    stopLogPolling,
  };
}
