import { computed, onBeforeUnmount, ref, watch } from 'vue';

import {
  cancelMigrationMutation,
  fetchMigrationMutationStatus,
  fetchMigrationOverview,
  migrationMutationWebSocketUrl,
  planMigrationMutation,
  prepareMigrationMutation,
  startMigrationMutation,
  type MigrationMutationExecutionSnapshot,
  type MigrationMutationPlan,
  type MigrationOverview,
} from '../api/migrations';
import { usePtyTerminalSocket } from './usePtyTerminalSocket';

const STALE_PLAN_MESSAGE =
  'O plano ou ambiente mudou. Revise a inspeção atual e confirme novamente antes de aplicar migrations.';

function messageFrom(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/**
 * Estado e lifecycle da execução destacável. Apenas a API é autoridade sobre
 * plano, token e contexto de execução; a revisão visual não envia comandos.
 */
export function useProjectMigrationsLifecycle(
  projectId: () => string,
  environmentInstanceId: () => string | undefined,
) {
  const loading = ref(false);
  const refreshing = ref(false);
  const errorMessage = ref('');
  const mutationError = ref('');
  const overview = ref<MigrationOverview | null>(null);
  const mutationPlan = ref<MigrationMutationPlan | null>(null);
  const mutationSnapshot = ref<MigrationMutationExecutionSnapshot | null>(null);
  const reviewedPlan = ref<MigrationMutationPlan | null>(null);
  const mutationBusy = ref(false);
  const cancelling = ref(false);
  let generation = 0;
  let disposed = false;

  function isCurrent(
    requestGeneration: number,
    id: string,
    environment: string | undefined,
  ): boolean {
    return (
      !disposed &&
      requestGeneration === generation &&
      projectId() === id &&
      environmentInstanceId() === environment
    );
  }

  const {
    terminalContainer,
    connecting,
    connect,
    disconnect,
    disposeTerminal,
  } = usePtyTerminalSocket<MigrationMutationExecutionSnapshot>({
    onReady: (snapshot) => {
      if (
        mutationSnapshot.value?.environmentInstanceId ===
        snapshot.environmentInstanceId
      ) {
        mutationSnapshot.value = snapshot;
      }
    },
    onExit: (exitCode, exitSignal, snapshot) => {
      const current = mutationSnapshot.value;
      if (!current) return;
      mutationSnapshot.value = snapshot ?? {
        ...current,
        status: 'exited',
        exitCode,
        exitSignal,
        endedAt: new Date().toISOString(),
      };
      cancelling.value = false;
      void refreshReadModel();
    },
    onError: (message) => {
      mutationError.value = message;
    },
  });

  const mutationRunning = computed(
    () => mutationSnapshot.value?.status === 'running',
  );
  const mutationReady = computed(
    () => mutationPlan.value?.preflight.state === 'ready',
  );
  const canApply = computed(
    () =>
      mutationReady.value &&
      !mutationRunning.value &&
      !mutationBusy.value &&
      !refreshing.value &&
      !loading.value,
  );

  const executionState = computed(() => {
    if (mutationSnapshot.value?.status === 'running') {
      return cancelling.value ? 'Cancelando' : 'Executando';
    }
    if (mutationSnapshot.value?.status === 'exited') {
      return mutationSnapshot.value.exitCode === 0 ? 'Concluído' : 'Falhou';
    }
    if (mutationPlan.value?.preflight.state === 'ready') return 'Plano pronto';
    if (mutationPlan.value?.preflight.state === 'blocked') {
      return 'Preflight bloqueado';
    }
    return 'Somente leitura';
  });

  function resetContext(): void {
    reviewedPlan.value = null;
    overview.value = null;
    mutationPlan.value = null;
    mutationSnapshot.value = null;
    mutationError.value = '';
    errorMessage.value = '';
    mutationBusy.value = false;
    cancelling.value = false;
    disconnect();
    disposeTerminal();
  }

  async function refresh(reset = false): Promise<void> {
    if (!reset && mutationBusy.value) return;
    const id = projectId();
    const environment = environmentInstanceId();
    const requestGeneration = ++generation;
    reviewedPlan.value = null;
    mutationPlan.value = null;
    if (reset) resetContext();
    loading.value = reset;
    refreshing.value = !reset;
    errorMessage.value = '';
    if (!reset) mutationError.value = '';

    try {
      const readModel = await fetchMigrationOverview(
        id,
        undefined,
        environment,
      );
      if (!isCurrent(requestGeneration, id, environment)) return;
      overview.value = readModel;

      const plan = await planMigrationMutation(
        id,
        readModel.database,
        environment,
      );
      if (!isCurrent(requestGeneration, id, environment)) return;
      mutationPlan.value = plan;

      // Reattach somente se não houver snapshot/terminal ativo. Um refresh
      // manual nunca descarta o buffer nem troca a conexão existente.
      if (!mutationSnapshot.value) {
        const snapshot = await fetchMigrationMutationStatus(
          id,
          plan.environmentInstanceId,
        );
        if (!isCurrent(requestGeneration, id, environment)) return;
        mutationSnapshot.value = snapshot;
        if (snapshot) {
          connect(
            migrationMutationWebSocketUrl(id, plan.environmentInstanceId),
          );
        }
      }
    } catch (error) {
      if (!isCurrent(requestGeneration, id, environment)) return;
      if (reset || !overview.value) {
        errorMessage.value = messageFrom(
          error,
          'Não foi possível carregar o estado das migrations.',
        );
      } else {
        mutationError.value = messageFrom(
          error,
          'Não foi possível atualizar a inspeção de migrations.',
        );
      }
    } finally {
      if (isCurrent(requestGeneration, id, environment)) {
        loading.value = false;
        refreshing.value = false;
      }
    }
  }

  // Atualiza os dados sem perder execução, terminal ou erro que explica
  // a falha da confirmação anterior.
  async function refreshReadModel(): Promise<void> {
    const id = projectId();
    const environment = environmentInstanceId();
    const requestGeneration = ++generation;
    reviewedPlan.value = null;
    mutationPlan.value = null;
    refreshing.value = true;
    try {
      const readModel = await fetchMigrationOverview(
        id,
        undefined,
        environment,
      );
      if (!isCurrent(requestGeneration, id, environment)) return;
      overview.value = readModel;
      const plan = await planMigrationMutation(
        id,
        readModel.database,
        environment,
      );
      if (isCurrent(requestGeneration, id, environment)) {
        mutationPlan.value = plan;
      }
    } catch (error) {
      if (isCurrent(requestGeneration, id, environment)) {
        mutationError.value =
          mutationError.value ||
          messageFrom(
            error,
            'Não foi possível atualizar o estado das migrations.',
          );
      }
    } finally {
      if (isCurrent(requestGeneration, id, environment))
        refreshing.value = false;
    }
  }

  function requestReview(): void {
    if (!canApply.value || !mutationPlan.value) return;
    reviewedPlan.value = mutationPlan.value;
    mutationError.value = '';
  }

  function cancelReview(): void {
    reviewedPlan.value = null;
  }

  async function confirmAndStart(): Promise<void> {
    const plan = reviewedPlan.value;
    if (
      !plan ||
      plan !== mutationPlan.value ||
      !canApply.value ||
      mutationBusy.value
    ) {
      return;
    }

    const id = projectId();
    const environment = environmentInstanceId();
    const requestGeneration = generation;
    mutationBusy.value = true;
    mutationError.value = '';
    try {
      const confirmation = await prepareMigrationMutation(id, plan);
      if (
        !isCurrent(requestGeneration, id, environment) ||
        reviewedPlan.value !== plan ||
        mutationPlan.value !== plan
      ) {
        // Nunca inicie uma mutation confirmada num contexto descartado.
        return;
      }
      if (confirmation.planHash !== plan.planHash) {
        throw new Error(STALE_PLAN_MESSAGE);
      }

      const snapshot = await startMigrationMutation(
        id,
        plan,
        confirmation.token,
      );
      if (!isCurrent(requestGeneration, id, environment)) return;
      mutationSnapshot.value = snapshot;
      reviewedPlan.value = null;
      cancelling.value = false;
      disconnect();
      disposeTerminal();
      connect(
        migrationMutationWebSocketUrl(id, snapshot.environmentInstanceId),
      );
    } catch (error) {
      if (!isCurrent(requestGeneration, id, environment)) return;
      const code =
        error && typeof error === 'object' && 'code' in error
          ? (error as { code?: unknown }).code
          : undefined;
      mutationError.value =
        code === 'MIGRATION_MUTATION_PLAN_CHANGED' ||
        code === 'MIGRATION_MUTATION_CONFIRMATION_REQUIRED' ||
        code === 'MIGRATION_MUTATION_PLAN_NOT_READY' ||
        code === 'MIGRATION_MUTATION_EXECUTION_CONTEXT_CHANGED'
          ? STALE_PLAN_MESSAGE
          : messageFrom(error, 'Não foi possível iniciar as migrations.');
      reviewedPlan.value = null;
      await refreshReadModel();
    } finally {
      if (projectId() === id && environmentInstanceId() === environment) {
        mutationBusy.value = false;
      }
    }
  }

  async function cancelMutation(): Promise<void> {
    const snapshot = mutationSnapshot.value;
    if (
      !snapshot ||
      snapshot.status !== 'running' ||
      mutationBusy.value ||
      cancelling.value
    ) {
      return;
    }
    const id = projectId();
    const environment = environmentInstanceId();
    const requestGeneration = generation;
    mutationBusy.value = true;
    cancelling.value = true;
    mutationError.value = '';
    try {
      await cancelMigrationMutation(id, snapshot.environmentInstanceId);
    } catch (error) {
      if (isCurrent(requestGeneration, id, environment)) {
        cancelling.value = false;
        mutationError.value = messageFrom(
          error,
          'Não foi possível cancelar a execução das migrations.',
        );
      }
    } finally {
      if (projectId() === id && environmentInstanceId() === environment) {
        mutationBusy.value = false;
      }
    }
  }

  watch(
    () => [projectId(), environmentInstanceId()] as const,
    () => void refresh(true),
    { immediate: true, flush: 'sync' },
  );

  onBeforeUnmount(() => {
    disposed = true;
    generation += 1;
  });

  return {
    loading,
    refreshing,
    errorMessage,
    mutationError,
    overview,
    mutationPlan,
    mutationSnapshot,
    reviewedPlan,
    mutationBusy,
    cancelling,
    mutationRunning,
    mutationReady,
    canApply,
    executionState,
    terminalContainer,
    connecting,
    refresh,
    requestReview,
    cancelReview,
    confirmAndStart,
    cancelMutation,
  };
}
