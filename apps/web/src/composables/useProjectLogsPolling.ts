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
  followProjectProcessLogEvents,
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
  let logStream: { close: () => void; done: Promise<void> } | undefined;
  let clearingLog = false;
  const clearing = ref(false);

  function isCurrentProject(projectId: string, generation: number): boolean {
    return (
      getProject().id === projectId && projectRequests.isCurrent(generation)
    );
  }

  // Fluxos normais seguem o padrão de terminal: eventos novos aparecem no final.
  async function scrollLogsToLatest(): Promise<void> {
    if (!followLogs.value) return;

    await nextTick();
    const element = logContainer.value;

    if (element) {
      element.scrollTop = element.scrollHeight;
    }
  }

  // Busca avulsa (ação "Atualizar" do menu) — a leitura contínua vem do stream SSE.
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

  function stopLogStream(): void {
    if (logStream) {
      logStream.close();
      logStream = undefined;
    }
  }

  function startLogStream(): void {
    stopLogStream();

    if (
      streamPaused.value ||
      !supportsServer.value ||
      !hasManagedProcess.value
    ) {
      return;
    }

    const projectId = getProject().id;
    const generation = projectRequests.capture();
    const logGeneration = logRequests.capture();
    loadingLogs.value = true;

    logStream = followProjectProcessLogEvents(projectId, (snapshot) => {
      if (
        !isCurrentProject(projectId, generation) ||
        !logRequests.isCurrent(logGeneration)
      ) {
        return;
      }

      logErrorMessage.value = '';
      loadingLogs.value = false;
      logSnapshot.value = snapshot;
      void scrollLogsToLatest();
    });

    logStream.done.catch((error: unknown) => {
      if (
        isCurrentProject(projectId, generation) &&
        logRequests.isCurrent(logGeneration)
      ) {
        loadingLogs.value = false;
        logErrorMessage.value =
          error instanceof Error
            ? error.message
            : 'Não foi possível acompanhar os logs.';
      }
    });
  }

  function handleLogScroll(): void {
    const element = logContainer.value;
    if (!element) return;

    followLogs.value =
      element.scrollHeight - element.scrollTop - element.clientHeight < 40;
  }

  async function clearLogView(): Promise<void> {
    if (!hasManagedProcess.value || clearingLog) return;

    const projectId = getProject().id;
    const generation = projectRequests.capture();
    const clearGeneration = logRequests.invalidate();
    logRequestGate.invalidate();
    clearingLog = true;
    clearing.value = true;
    loadingLogs.value = true;
    logErrorMessage.value = '';
    stopLogStream();

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
        clearing.value = false;
        loadingLogs.value = false;
        startLogStream();
      }
    }
  }

  function toggleStream(): void {
    streamPaused.value = !streamPaused.value;

    if (streamPaused.value) {
      stopLogStream();
    } else {
      startLogStream();
    }
  }

  function reset(): void {
    projectRequests.invalidate();
    logRequests.invalidate();
    logRequestGate.invalidate();
    stopLogStream();
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
        stopLogStream();
        return;
      }

      startLogStream();
    },
    { immediate: true },
  );

  onBeforeUnmount(() => {
    projectRequests.invalidate();
    logRequests.invalidate();
    logRequestGate.invalidate();
    stopLogStream();
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
    clearing,
    toggleStream,
  };
}
