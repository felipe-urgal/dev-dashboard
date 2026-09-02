import { computed, ref, watch, type ComputedRef, type Ref } from 'vue';

import type { Project, ProjectScript } from '@dev-dashboard/contracts';

import {
  cancelProjectDependenciesPty,
  fetchProjectDependenciesPtyStatus,
  projectDependenciesPtyWebSocketUrl,
  startProjectDependenciesPty,
  type ProjectDependenciesPtyStatusSnapshot,
} from '../api';
import { confirmDialog } from '../stores/app-dialog';
import { usePtyTerminalSocket } from './usePtyTerminalSocket';

/**
 * Item 3 da task 234: mesmo padrão de `useRailsMigrations` (execução
 * destacável via `usePtyTerminalSocket`), aplicado às ações de
 * dependências/build do painel `ProjectDependenciesPanel.vue`. Substitui por
 * completo o fluxo antigo baseado em `useScriptExecution` (SSE, com
 * confirmação por token e histórico persistido) — mesma decisão tomada para
 * Migration: sem manter o código antigo como referência.
 */
export function useProjectDependenciesPty(
  getProject: () => Project,
  isSupportedProject: Ref<boolean> | ComputedRef<boolean>,
) {
  const snapshot = ref<ProjectDependenciesPtyStatusSnapshot | null>(null);
  const errorMessage = ref('');
  const starting = ref<string | null>(null);
  const cancelling = ref(false);

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
    },
    onExit: (exitCode, exitSignal) => {
      if (snapshot.value) {
        snapshot.value = {
          ...snapshot.value,
          status: 'exited',
          exitCode,
          exitSignal,
          endedAt: new Date().toISOString(),
        };
      }
    },
    onError: (message) => {
      errorMessage.value = message;
    },
  });

  const isRunning = computed(() => snapshot.value?.status === 'running');

  async function loadStatusAndReconnect(): Promise<void> {
    if (!isSupportedProject.value) return;
    try {
      const result = await fetchProjectDependenciesPtyStatus(getProject().id);
      snapshot.value = result;
      if (result) connect(projectDependenciesPtyWebSocketUrl(getProject().id));
    } catch {
      // best-effort: se a consulta inicial falhar, os botões de ação ainda funcionam.
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
    // Uma execução concluída pode manter o WebSocket anterior aberto. Ao
    // iniciar de novo, desconecta primeiro para que o terminal novo se anexe
    // ao novo registro do backend em vez de continuar ouvindo o PTY antigo.
    disconnect();
    disposeTerminal();
    try {
      snapshot.value = await startProjectDependenciesPty(
        getProject().id,
        action.id,
      );
      connect(projectDependenciesPtyWebSocketUrl(getProject().id));
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
      await cancelProjectDependenciesPty(getProject().id);
    } catch (error) {
      errorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível cancelar a execução.';
    } finally {
      cancelling.value = false;
    }
  }

  watch(
    () => getProject().id,
    () => {
      snapshot.value = null;
      errorMessage.value = '';
      starting.value = null;
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
    isRunning,
    terminalContainer,
    run,
    cancel,
  };
}
