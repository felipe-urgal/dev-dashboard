import { computed, ref, watch, type ComputedRef, type Ref } from 'vue';

import type { Project, ProjectScript } from '@dev-dashboard/contracts';

import {
  cancelProjectDependenciesPty,
  fetchProjectDependenciesPtyStatus,
  prepareProjectDependenciesPtyConfirmation,
  projectDependenciesPtyWebSocketUrl,
  startProjectDependenciesPty,
  type ProjectDependenciesPtyStatusSnapshot,
} from '../api';
import { confirmDialog } from '../stores/app-dialog';
import { usePtyTerminalSocket } from './usePtyTerminalSocket';

export function useProjectDependenciesPty(
  getProject: () => Project,
  isSupportedProject: Ref<boolean> | ComputedRef<boolean>,
  getEnvironmentInstanceId?: () => string | undefined,
) {
  const snapshot = ref<ProjectDependenciesPtyStatusSnapshot | null>(null);
  const errorMessage = ref('');
  const starting = ref<string | null>(null);
  const cancelling = ref(false);
  const connectionLost = ref(false);

  const {
    terminalContainer,
    connecting,
    connect,
    disconnect,
    disposeTerminal,
  } = usePtyTerminalSocket<
    ProjectDependenciesPtyStatusSnapshot & { buffer: string }
  >({
    onReady: (ready) => {
      snapshot.value = ready;
      connectionLost.value = false;
    },
    onExit: (exitCode, exitSignal, exitSnapshot) => {
      snapshot.value =
        exitSnapshot ??
        (snapshot.value
          ? {
              ...snapshot.value,
              status: 'exited',
              exitCode,
              exitSignal,
              endedAt: new Date().toISOString(),
            }
          : null);
      connectionLost.value = false;
    },
    onError: (message) => {
      errorMessage.value = message;
    },
    onOpen: () => {
      connectionLost.value = false;
    },
    onClose: () => {
      if (isRunning.value) connectionLost.value = true;
    },
  });

  const isRunning = computed(() => snapshot.value?.status === 'running');

  async function loadStatusAndReconnect(): Promise<void> {
    if (!isSupportedProject.value) return;
    const project = getProject();
    const environmentInstanceId = getEnvironmentInstanceId?.();
    try {
      const result = await fetchProjectDependenciesPtyStatus(
        project.id,
        environmentInstanceId,
      );
      snapshot.value = result;
      connectionLost.value = false;
      if (result) {
        connect(
          projectDependenciesPtyWebSocketUrl(project.id, environmentInstanceId),
        );
      }
    } catch {
      // Best-effort: o catálogo continua utilizável mesmo se o status falhar.
    }
  }

  async function run(action: ProjectScript): Promise<void> {
    if (starting.value || isRunning.value) return;

    if (action.risk !== 'read-only') {
      const riskLabel =
        action.risk === 'destructive' ? 'destrutiva' : 'mutável';
      const confirmed = await confirmDialog({
        title: `Executar ação ${riskLabel}?`,
        message: `A ação "${action.name}" executará código do projeto localmente.`,
        confirmLabel: 'Executar ação',
        tone: action.risk === 'destructive' ? 'danger' : 'warning',
      });
      if (!confirmed) return;
    }

    starting.value = action.id;
    errorMessage.value = '';
    disconnect();
    disposeTerminal();

    const project = getProject();
    const environmentInstanceId = getEnvironmentInstanceId?.();
    try {
      const confirmationToken =
        action.risk === 'read-only'
          ? undefined
          : (
              await prepareProjectDependenciesPtyConfirmation(
                project.id,
                action.id,
                environmentInstanceId,
              )
            ).token;

      snapshot.value = await startProjectDependenciesPty(
        project.id,
        action.id,
        environmentInstanceId,
        confirmationToken,
      );
      connectionLost.value = false;
      connect(
        projectDependenciesPtyWebSocketUrl(project.id, environmentInstanceId),
      );
    } catch (error) {
      errorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível iniciar a ação.';
      await loadStatusAndReconnect();
    } finally {
      starting.value = null;
    }
  }

  async function cancel(): Promise<void> {
    cancelling.value = true;
    try {
      await cancelProjectDependenciesPty(
        getProject().id,
        getEnvironmentInstanceId?.(),
      );
    } catch (error) {
      errorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível cancelar a execução.';
    } finally {
      cancelling.value = false;
    }
  }

  function reconnect(): void {
    errorMessage.value = '';
    connectionLost.value = false;
    disconnect();
    connect(
      projectDependenciesPtyWebSocketUrl(
        getProject().id,
        getEnvironmentInstanceId?.(),
      ),
    );
  }

  function clear(): void {
    if (isRunning.value) return;
    snapshot.value = null;
    errorMessage.value = '';
    connectionLost.value = false;
    disconnect();
    disposeTerminal();
  }

  watch(
    [() => getProject().id, () => getEnvironmentInstanceId?.()],
    () => {
      snapshot.value = null;
      errorMessage.value = '';
      starting.value = null;
      connectionLost.value = false;
      disconnect();
      disposeTerminal();
      void loadStatusAndReconnect();
    },
    { immediate: true },
  );

  return {
    snapshot,
    errorMessage,
    starting,
    cancelling,
    connecting,
    connectionLost,
    isRunning,
    terminalContainer,
    run,
    cancel,
    reconnect,
    clear,
  };
}
