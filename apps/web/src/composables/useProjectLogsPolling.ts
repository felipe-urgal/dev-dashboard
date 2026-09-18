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
  getEnvironmentInstanceId: () => string | undefined = () => undefined,
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

  function isCurrentContext(
    projectId: string,
    environmentInstanceId: string | undefined,
    generation: number,
  ): boolean {
    return (
      getProject().id === projectId &&
      getEnvironmentInstanceId() === environmentInstanceId &&
      projectRequests.isCurrent(generation)
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
    const environmentInstanceId = getEnvironmentInstanceId();
    const generation = projectRequests.capture();
    const logGeneration = logRequests.capture();
    loadingLogs.value = true;
    logErrorMessage.value = '';

    try {
      const snapshot = await fetchProjectProcessLog(
        projectId,
        65_536,
        environmentInstanceId,
      );

      if (
        isCurrentContext(projectId, environmentInstanceId, generation) &&
        logRequests.isCurrent(logGeneration)
      ) {
        logSnapshot.value = snapshot;
        await scrollLogsToLatest();
      }
    } catch (error) {
      if (
        isCurrentContext(projectId, environmentInstanceId, generation) &&
        logRequests.isCurrent(logGeneration)
      ) {
        logErrorMessage.value =
          error instanceof Error
            ? error.message
            : 'Não foi possível carregar os logs.';
      }
    } finally {
      if (logRequestGate.finish(requestToken)) {
        if (
          isCurrentContext(projectId, environmentInstanceId, generation) &&
          !clearingLog
        ) {
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
      loadingLogs.value = false;
      return;
    }

    const projectId = getProject().id;
    const environmentInstanceId = getEnvironmentInstanceId();
    const generation = projectRequests.capture();
    const logGeneration = logRequests.capture();
    loadingLogs.value = true;

    const stream = followProjectProcessLogEvents(
      projectId,
      (snapshot) => {
        if (
          logStream !== stream ||
          !isCurrentContext(projectId, environmentInstanceId, generation) ||
          !logRequests.isCurrent(logGeneration)
        ) {
          return;
        }

        logErrorMessage.value = '';
        loadingLogs.value = false;
        logSnapshot.value = snapshot;
        void scrollLogsToLatest();
      },
      environmentInstanceId,
    );
    logStream = stream;

    void stream.done
      .catch((error: unknown) => {
        if (
          logStream !== stream ||
          !isCurrentContext(projectId, environmentInstanceId, generation) ||
          !logRequests.isCurrent(logGeneration)
        ) {
          return;
        }

        logErrorMessage.value =
          error instanceof Error
            ? error.message
            : 'Não foi possível acompanhar os logs.';
      })
      .finally(() => {
        if (logStream === stream) {
          logStream = undefined;
          loadingLogs.value = false;
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
    const environmentInstanceId = getEnvironmentInstanceId();
    const generation = projectRequests.capture();
    const clearGeneration = logRequests.invalidate();
    logRequestGate.invalidate();
    clearingLog = true;
    clearing.value = true;
    loadingLogs.value = true;
    logErrorMessage.value = '';
    stopLogStream();

    try {
      const snapshot = await clearProjectProcessLog(
        projectId,
        environmentInstanceId,
      );

      if (
        isCurrentContext(projectId, environmentInstanceId, generation) &&
        logRequests.isCurrent(clearGeneration)
      ) {
        logSnapshot.value = snapshot;
        followLogs.value = true;
        await scrollLogsToLatest();
      }
    } catch (error) {
      if (isCurrentContext(projectId, environmentInstanceId, generation)) {
        logErrorMessage.value =
          error instanceof Error
            ? error.message
            : 'Não foi possível limpar os logs.';
      }
    } finally {
      if (isCurrentContext(projectId, environmentInstanceId, generation)) {
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
      loadingLogs.value = false;
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
    () => `${getProject().id}:${getEnvironmentInstanceId() ?? ''}`,
    () => {
      reset();
      if (hasManagedProcess.value) startLogStream();
    },
  );

  watch(
    hasManagedProcess,
    (available) => {
      if (!available) {
        stopLogStream();
        loadingLogs.value = false;
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
