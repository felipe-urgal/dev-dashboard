import { computed, onBeforeUnmount, ref, watch } from 'vue';

import type {
  ManagedProcess,
  ManagedProcessStatus,
  Project,
  ProcessLogSnapshot,
  RailsWorkerId,
} from '@dev-dashboard/contracts';

import {
  clearProjectRailsWorkerLog,
  fetchProjectRailsWorker,
  fetchProjectRailsWorkerLog,
  followProjectRailsWorkerLogEvents,
  restartProjectRailsWorker,
  startProjectRailsWorker,
  stopProjectRailsWorker,
} from '../api';
import { RequestGate, RequestGeneration } from '../utils/request-generation';

/**
 * Estado e ações de um worker de fundo Rails (Sidekiq ou webpack-dev-server)
 * para um projeto, sobre o `kind: 'worker' | 'webpack'` do process-manager.
 * Segue o padrão de `useProjectProcessStatus`: invalida o próprio estado ao
 * trocar de projeto (padrão `generation`).
 */
export function useProjectRailsWorker(
  getProject: () => Project,
  workerId: RailsWorkerId,
  supportsRestart: boolean,
) {
  const detected = ref(false);
  const managedProcess = ref<ManagedProcess | null>(null);
  const loading = ref(false);
  const errorMessage = ref('');
  const currentAction = ref<'start' | 'stop' | 'restart' | null>(null);
  const log = ref<ProcessLogSnapshot | null>(null);
  const logLoading = ref(false);
  const clearingLog = ref(false);
  const logsVisible = ref(false);

  let pollingTimer: ReturnType<typeof setTimeout> | undefined;
  let logStream: { close: () => void; done: Promise<void> } | undefined;
  const projectRequests = new RequestGeneration();
  const requestGate = new RequestGate();

  const supportsWorker = computed(() => getProject().type === 'rails');

  const status = computed<ManagedProcessStatus>(
    () => managedProcess.value?.status ?? 'stopped',
  );

  const isRunning = computed(
    () => status.value === 'running' || status.value === 'starting',
  );

  const canStop = computed(
    () => isRunning.value || status.value === 'stopping',
  );

  const statusLabel = computed(() => {
    if (!supportsWorker.value) return 'Não disponível';
    if (loading.value && !managedProcess.value) return 'Verificando';
    switch (status.value) {
      case 'starting':
        return 'Iniciando';
      case 'running':
        return 'Executando';
      case 'stopping':
        return 'Encerrando';
      case 'failed':
        return 'Falhou';
      default:
        return 'Parado';
    }
  });

  function isCurrentProject(projectId: string, generation: number): boolean {
    return (
      getProject().id === projectId && projectRequests.isCurrent(generation)
    );
  }

  async function refresh(): Promise<void> {
    if (!supportsWorker.value) return;

    const requestToken = requestGate.begin(`rails-worker-${workerId}`);
    if (!requestToken) return;

    const projectId = getProject().id;
    const generation = projectRequests.capture();
    loading.value = true;

    try {
      const overview = await fetchProjectRailsWorker(projectId, workerId);
      if (isCurrentProject(projectId, generation)) {
        detected.value = overview.detected;
        managedProcess.value = overview.process;
      }
    } catch (error) {
      if (isCurrentProject(projectId, generation)) {
        errorMessage.value =
          error instanceof Error
            ? error.message
            : 'Não foi possível consultar o worker.';
      }
    } finally {
      if (
        requestGate.finish(requestToken) &&
        isCurrentProject(projectId, generation)
      ) {
        loading.value = false;
      }
    }
  }

  function stopPolling(): void {
    if (pollingTimer) {
      clearTimeout(pollingTimer);
      pollingTimer = undefined;
    }
  }

  function schedulePolling(): void {
    stopPolling();
    if (
      !supportsWorker.value ||
      !detected.value ||
      !['starting', 'running', 'stopping'].includes(status.value)
    ) {
      return;
    }

    const generation = projectRequests.capture();
    const delay =
      status.value === 'starting' || status.value === 'stopping'
        ? 1_000
        : 5_000;

    pollingTimer = setTimeout(async () => {
      await refresh();
      if (projectRequests.isCurrent(generation)) {
        schedulePolling();
      }
    }, delay);
  }

  // Busca avulsa (ação "Atualizar") — a leitura contínua vem do stream SSE
  // aberto enquanto `logsVisible` estiver true (ver startLogStream).
  async function refreshLog(): Promise<void> {
    const projectId = getProject().id;
    const generation = projectRequests.capture();
    logLoading.value = true;

    try {
      const snapshot = await fetchProjectRailsWorkerLog(projectId, workerId);
      if (isCurrentProject(projectId, generation)) {
        log.value = snapshot;
      }
    } catch (error) {
      if (isCurrentProject(projectId, generation)) {
        errorMessage.value =
          error instanceof Error
            ? error.message
            : 'Não foi possível carregar o log.';
      }
    } finally {
      if (isCurrentProject(projectId, generation)) {
        logLoading.value = false;
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

    const projectId = getProject().id;
    const generation = projectRequests.capture();
    logLoading.value = true;

    logStream = followProjectRailsWorkerLogEvents(
      projectId,
      workerId,
      (snapshot) => {
        if (!isCurrentProject(projectId, generation)) return;

        logLoading.value = false;
        log.value = snapshot;
      },
    );

    logStream.done.catch((error: unknown) => {
      if (isCurrentProject(projectId, generation)) {
        logLoading.value = false;
        errorMessage.value =
          error instanceof Error
            ? error.message
            : 'Não foi possível acompanhar o log.';
      }
    });
  }

  function toggleLogs(): void {
    logsVisible.value = !logsVisible.value;
    if (logsVisible.value) {
      startLogStream();
    } else {
      stopLogStream();
    }
  }

  async function clearLog(): Promise<void> {
    if (clearingLog.value) return;

    const projectId = getProject().id;
    const generation = projectRequests.invalidate();
    clearingLog.value = true;
    stopLogStream();

    try {
      const snapshot = await clearProjectRailsWorkerLog(projectId, workerId);
      if (isCurrentProject(projectId, generation)) {
        log.value = snapshot;
      }
    } catch (error) {
      if (isCurrentProject(projectId, generation)) {
        errorMessage.value =
          error instanceof Error
            ? error.message
            : 'Não foi possível limpar o log.';
      }
    } finally {
      if (isCurrentProject(projectId, generation)) {
        clearingLog.value = false;
        startLogStream();
      }
    }
  }

  async function start(): Promise<void> {
    if (!supportsWorker.value) return;

    const projectId = getProject().id;
    const generation = projectRequests.capture();
    currentAction.value = 'start';
    errorMessage.value = '';

    try {
      const nextProcess = await startProjectRailsWorker(projectId, workerId);
      if (isCurrentProject(projectId, generation)) {
        managedProcess.value = nextProcess;
        schedulePolling();
      }
    } catch (error) {
      if (isCurrentProject(projectId, generation)) {
        errorMessage.value =
          error instanceof Error
            ? error.message
            : 'Não foi possível iniciar o worker.';
      }
    } finally {
      if (isCurrentProject(projectId, generation)) currentAction.value = null;
    }
  }

  async function stop(): Promise<void> {
    if (!supportsWorker.value) return;

    const projectId = getProject().id;
    const generation = projectRequests.capture();
    currentAction.value = 'stop';
    errorMessage.value = '';

    try {
      const nextProcess = await stopProjectRailsWorker(projectId, workerId);
      if (isCurrentProject(projectId, generation)) {
        managedProcess.value = nextProcess;
        schedulePolling();
      }
    } catch (error) {
      if (isCurrentProject(projectId, generation)) {
        errorMessage.value =
          error instanceof Error
            ? error.message
            : 'Não foi possível parar o worker.';
      }
    } finally {
      if (isCurrentProject(projectId, generation)) currentAction.value = null;
    }
  }

  async function restart(): Promise<void> {
    if (!supportsRestart || !supportsWorker.value) return;

    const projectId = getProject().id;
    const generation = projectRequests.capture();
    currentAction.value = 'restart';
    errorMessage.value = '';

    try {
      const nextProcess = await restartProjectRailsWorker(projectId, workerId);
      if (isCurrentProject(projectId, generation)) {
        managedProcess.value = nextProcess;
        schedulePolling();
      }
    } catch (error) {
      if (isCurrentProject(projectId, generation)) {
        errorMessage.value =
          error instanceof Error
            ? error.message
            : 'Não foi possível reiniciar o worker.';
      }
    } finally {
      if (isCurrentProject(projectId, generation)) currentAction.value = null;
    }
  }

  async function initialize(): Promise<void> {
    stopPolling();
    stopLogStream();
    projectRequests.invalidate();
    requestGate.invalidate();
    detected.value = false;
    managedProcess.value = null;
    loading.value = false;
    errorMessage.value = '';
    currentAction.value = null;
    log.value = null;
    logLoading.value = false;
    logsVisible.value = false;

    const generation = projectRequests.capture();
    if (!supportsWorker.value) return;

    await refresh();
    if (!projectRequests.isCurrent(generation)) return;
    schedulePolling();
  }

  watch(
    () => getProject().id,
    () => {
      void initialize();
    },
    { immediate: true },
  );

  onBeforeUnmount(() => {
    projectRequests.invalidate();
    stopPolling();
    stopLogStream();
  });

  return {
    detected,
    supportsWorker,
    managedProcess,
    loading,
    errorMessage,
    currentAction,
    status,
    isRunning,
    canStop,
    statusLabel,
    log,
    logLoading,
    clearingLog,
    logsVisible,
    startLogStream,
    stopLogStream,
    toggleLogs,
    refreshLog,
    clearLog,
    start,
    stop,
    restart,
  };
}
