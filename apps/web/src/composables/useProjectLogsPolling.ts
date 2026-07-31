import {
  nextTick,
  onBeforeUnmount,
  ref,
  watch,
  type ComputedRef,
  type Ref,
} from 'vue';

import type { ProcessLogSnapshot, Project } from '@dev-dashboard/contracts';

import {
  clearProjectProcessLog,
  fetchProjectProcessLog,
} from '../api';
import { RequestGate, RequestGeneration } from '../utils/request-generation';

export function useProjectLogsPolling(
  getProject: () => Project,
  hasManagedProcess: Ref<boolean> | ComputedRef<boolean>,
  supportsServer: Ref<boolean> | ComputedRef<boolean>,
  logContainer: Ref<HTMLElement | null>,
) {
  const loadingLogs = ref(false);
  const logSnapshot = ref<ProcessLogSnapshot | null>(null);
  const logErrorMessage = ref('');
  const followLogs = ref(true);
  const streamPaused = ref(false);

  const projectRequests = new RequestGeneration();
  const logRequests = new RequestGeneration();
  const logRequestGate = new RequestGate();
  let logPollingTimer: ReturnType<typeof setTimeout> | undefined;
  let clearingLog = false;

  function isCurrentProject(
    projectId: string,
    generation: number,
  ): boolean {
    return (
      getProject().id === projectId &&
      projectRequests.isCurrent(generation)
    );
  }

  // The log feed renders newest-first, so "following" means staying pinned to the top.
  async function scrollLogsToLatest(): Promise<void> {
    if (!followLogs.value) return;

    await nextTick();
    const element = logContainer.value;

    if (element) {
      element.scrollTop = 0;
    }
  }

  async function refreshLogs(): Promise<void> {
    if (!hasManagedProcess.value || clearingLog) return;

    const requestToken = logRequestGate.begin('project-logs');
    if (!requestToken) return;

    const projectId = getProject().id;
    const generation = projectRequests.capture();
    const logGeneration = logRequests.capture();
    loadingLogs.value = true;
    logErrorMessage.value = '';

    try {
      const snapshot = await fetchProjectProcessLog(projectId);

      if (
        isCurrentProject(projectId, generation) &&
        logRequests.isCurrent(logGeneration)
      ) {
        logSnapshot.value = snapshot;
        await scrollLogsToLatest();
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
      if (logRequestGate.finish(requestToken)) {
        if (isCurrentProject(projectId, generation) && !clearingLog) {
          loadingLogs.value = false;
        }
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

    if (
      streamPaused.value ||
      !supportsServer.value ||
      !hasManagedProcess.value
    ) {
      return;
    }

    const generation = projectRequests.capture();
    logPollingTimer = setTimeout(async () => {
      await refreshLogs();

      if (
        projectRequests.isCurrent(generation) &&
        !streamPaused.value &&
        hasManagedProcess.value
      ) {
        scheduleLogPolling();
      }
    }, 2_000);
  }

  function handleLogScroll(): void {
    const element = logContainer.value;
    if (!element) return;

    followLogs.value = element.scrollTop < 40;
  }

  async function clearLogView(): Promise<void> {
    if (!hasManagedProcess.value || clearingLog) return;

    const projectId = getProject().id;
    const generation = projectRequests.capture();
    const clearGeneration = logRequests.invalidate();
    logRequestGate.invalidate();
    clearingLog = true;
    loadingLogs.value = true;
    logErrorMessage.value = '';
    stopLogPolling();

    try {
      const snapshot = await clearProjectProcessLog(projectId);

      if (
        isCurrentProject(projectId, generation) &&
        logRequests.isCurrent(clearGeneration)
      ) {
        logSnapshot.value = snapshot;
        followLogs.value = true;
        await scrollLogsToLatest();
      }
    } catch (error) {
      if (isCurrentProject(projectId, generation)) {
        logErrorMessage.value =
          error instanceof Error
            ? error.message
            : 'Não foi possível limpar os logs.';
      }
    } finally {
      if (isCurrentProject(projectId, generation)) {
        clearingLog = false;
        loadingLogs.value = false;
        scheduleLogPolling();
      }
    }
  }

  function toggleStream(): void {
    streamPaused.value = !streamPaused.value;

    if (streamPaused.value) {
      stopLogPolling();
    } else {
      void refreshLogs().then(scheduleLogPolling);
    }
  }

  function reset(): void {
    projectRequests.invalidate();
    logRequests.invalidate();
    logRequestGate.invalidate();
    stopLogPolling();
    clearingLog = false;
    loadingLogs.value = false;
    logSnapshot.value = null;
    logErrorMessage.value = '';
    followLogs.value = true;
    streamPaused.value = false;
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
    loadingLogs,
    logSnapshot,
    logErrorMessage,
    followLogs,
    streamPaused,
    refreshLogs,
    scrollLogsToLatest,
    handleLogScroll,
    clearLogView,
    toggleStream,
  };
}
