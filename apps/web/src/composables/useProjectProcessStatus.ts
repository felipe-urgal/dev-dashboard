import { computed, onBeforeUnmount, ref, watch } from 'vue';

import type {
  ManagedProcess,
  ManagedProcessStatus,
  Project,
} from '@dev-dashboard/contracts';

import { fetchProjectProcess } from '../api';
import { RequestGate, RequestGeneration } from '../utils/request-generation';

export function useProjectProcessStatus(getProject: () => Project) {
  const managedProcess = ref<ManagedProcess | null>(null);
  const loadingStatus = ref(false);
  const errorMessage = ref('');

  let processPollingTimer: ReturnType<typeof setTimeout> | undefined;
  const projectRequests = new RequestGeneration();
  const processRequestGate = new RequestGate();

  const supportsServer = computed(() =>
    getProject().capabilities.includes('server'),
  );

  const processStatus = computed<ManagedProcessStatus>(
    () => managedProcess.value?.status ?? 'stopped',
  );

  const isRunning = computed(
    () =>
      processStatus.value === 'running' || processStatus.value === 'starting',
  );

  const canStop = computed(
    () => isRunning.value || processStatus.value === 'stopping',
  );

  const hasManagedProcess = computed(() => managedProcess.value !== null);

  const statusLabel = computed(() => {
    if (!supportsServer.value) {
      return 'Sem servidor';
    }

    if (loadingStatus.value && !managedProcess.value) {
      return 'Verificando';
    }

    switch (processStatus.value) {
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

  async function refreshProcess(): Promise<void> {
    if (!supportsServer.value) {
      return;
    }

    const requestToken = processRequestGate.begin('process-request');

    if (!requestToken) {
      return;
    }

    const projectId = getProject().id;
    const generation = projectRequests.capture();
    loadingStatus.value = true;

    try {
      const nextProcess = await fetchProjectProcess(projectId);

      if (isCurrentProject(projectId, generation)) {
        managedProcess.value = nextProcess;
      }
    } catch (error) {
      if (isCurrentProject(projectId, generation)) {
        errorMessage.value =
          error instanceof Error
            ? error.message
            : 'Não foi possível consultar o processo.';
      }
    } finally {
      if (processRequestGate.finish(requestToken)) {
        if (isCurrentProject(projectId, generation)) {
          loadingStatus.value = false;
        }
      }
    }
  }

  function stopProcessPolling(): void {
    if (processPollingTimer) {
      clearTimeout(processPollingTimer);
      processPollingTimer = undefined;
    }
  }

  function scheduleProcessPolling(): void {
    stopProcessPolling();

    if (
      !supportsServer.value ||
      !['starting', 'running', 'stopping'].includes(processStatus.value)
    ) {
      return;
    }

    const generation = projectRequests.capture();
    const delay =
      processStatus.value === 'starting' || processStatus.value === 'stopping'
        ? 1_000
        : 5_000;

    processPollingTimer = setTimeout(async () => {
      await refreshProcess();

      if (projectRequests.isCurrent(generation) && supportsServer.value) {
        scheduleProcessPolling();
      }
    }, delay);
  }

  async function initialize(): Promise<void> {
    stopProcessPolling();
    projectRequests.invalidate();
    processRequestGate.invalidate();
    managedProcess.value = null;
    loadingStatus.value = false;
    errorMessage.value = '';

    const generation = projectRequests.capture();

    if (!supportsServer.value) {
      return;
    }

    await refreshProcess();

    if (!projectRequests.isCurrent(generation)) {
      return;
    }

    scheduleProcessPolling();
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
    stopProcessPolling();
  });

  return {
    managedProcess,
    loadingStatus,
    errorMessage,
    supportsServer,
    processStatus,
    isRunning,
    canStop,
    hasManagedProcess,
    statusLabel,
    refreshProcess,
    scheduleProcessPolling,
    stopProcessPolling,
  };
}
