import { ref, watch, type ComputedRef, type Ref } from 'vue';

import type {
  Project,
  RailsMigrationDetail,
  RailsMigrationEntry,
  RailsMigrationMutationOperation,
  RailsMigrationsOverview,
} from '@dev-dashboard/contracts';

import {
  cancelProjectRailsMigrationPty,
  fetchProjectRailsMigrationPtyStatus,
  fetchProjectRailsMigrations,
  projectRailsMigrationPtyWebSocketUrl,
  startProjectRailsMigrationPty,
  type RailsMigrationPtyStatusSnapshot,
} from '../api';
import { fetchProjectRailsMigrationDetail } from '../rails-explorer-api';
import { confirmDialog } from '../stores/app-dialog';
import { usePtyTerminalSocket } from './usePtyTerminalSocket';

const mutationLabels: Record<RailsMigrationMutationOperation, string> = {
  migrate: 'Rodar migrations pendentes (db:migrate)',
  rollback: 'Desfazer a última migration (db:rollback, 1 passo)',
  seed: 'Rodar seeds (db:seed)',
  prepare: 'Preparar o banco (db:prepare)',
};

const mutationConfirmationText: Record<
  RailsMigrationMutationOperation,
  string
> = {
  migrate: 'Todas as migrations pendentes serão executadas neste banco.',
  rollback:
    'A última migration aplicada será desfeita em um passo. Dados criados por ela podem ser apagados.',
  seed: 'O comando db:seed será executado neste banco e pode criar ou alterar dados.',
  prepare:
    'O comando db:prepare será executado e pode criar o banco ou carregar o schema mais recente.',
};

const mutationConfirmLabels: Record<RailsMigrationMutationOperation, string> = {
  migrate: 'Rodar migrations',
  rollback: 'Desfazer migration',
  seed: 'Rodar seeds',
  prepare: 'Preparar banco',
};

export function useRailsMigrations(
  getProject: () => Project,
  isRailsProject: Ref<boolean> | ComputedRef<boolean>,
) {
  const migrations = ref<RailsMigrationsOverview | null>(null);
  const migrationsLoading = ref(false);
  const migrationsErrorMessage = ref('');
  const migrationDetail = ref<RailsMigrationDetail | null>(null);
  const migrationDetailLoading = ref(false);
  const migrationDetailErrorMessage = ref('');
  const selectedMigrationVersion = ref('');
  const selectedDatabase = ref('primary');

  const mutationSnapshot = ref<RailsMigrationPtyStatusSnapshot | null>(null);
  const mutationErrorMessage = ref('');
  const mutationCancelling = ref(false);

  const {
    terminalContainer: mutationTerminalContainer,
    connecting: mutationConnecting,
    connect: connectMutation,
    disconnect: disconnectMutation,
    disposeTerminal: disposeMutationTerminal,
  } = usePtyTerminalSocket<
    RailsMigrationPtyStatusSnapshot & { buffer: string }
  >({
    onReady: (snapshot) => {
      mutationSnapshot.value = snapshot;
    },
    onExit: (exitCode, exitSignal) => {
      if (mutationSnapshot.value) {
        mutationSnapshot.value = {
          ...mutationSnapshot.value,
          status: 'exited',
          exitCode,
          exitSignal,
        };
      }
      void loadMigrations();
    },
    onError: (message) => {
      mutationErrorMessage.value = message;
    },
  });

  const mutationRunning = ref<RailsMigrationMutationOperation | ''>('');

  let generation = 0;

  async function loadMigrationDetail(version: string): Promise<void> {
    if (!version || !/^\d{8,20}$/.test(version)) {
      migrationDetail.value = null;
      return;
    }
    const current = generation;
    const database = selectedDatabase.value;
    migrationDetailLoading.value = true;
    migrationDetailErrorMessage.value = '';
    try {
      const result = await fetchProjectRailsMigrationDetail(
        getProject().id,
        version,
        database,
      );
      if (
        current === generation &&
        selectedMigrationVersion.value === version &&
        selectedDatabase.value === database
      )
        migrationDetail.value = result;
    } catch (error) {
      if (current === generation)
        migrationDetailErrorMessage.value =
          error instanceof Error
            ? error.message
            : 'Não foi possível carregar os detalhes da migration.';
    } finally {
      if (current === generation) migrationDetailLoading.value = false;
    }
  }

  async function loadMigrations(): Promise<void> {
    if (!isRailsProject.value) return;
    const current = generation;
    migrationsLoading.value = true;
    migrationsErrorMessage.value = '';
    try {
      const result = await fetchProjectRailsMigrations(
        getProject().id,
        selectedDatabase.value,
      );
      if (current !== generation) return;
      migrations.value = result;
      const preferred =
        result.migrations.find(
          (item) => item.version === selectedMigrationVersion.value,
        ) ??
        result.migrations.find((item) => item.status === 'down') ??
        result.migrations[0];
      selectedMigrationVersion.value = preferred?.version ?? '';
      if (preferred) await loadMigrationDetail(preferred.version);
    } catch (error) {
      if (current === generation)
        migrationsErrorMessage.value =
          error instanceof Error
            ? error.message
            : 'Não foi possível consultar as migrations.';
    } finally {
      if (current === generation) migrationsLoading.value = false;
    }
  }

  function selectMigration(entry: RailsMigrationEntry): void {
    selectedMigrationVersion.value = entry.version;
    migrationDetail.value = null;
    void loadMigrationDetail(entry.version);
  }

  function selectDatabase(database: string): void {
    if (selectedDatabase.value === database) return;
    selectedDatabase.value = database;
    selectedMigrationVersion.value = '';
    migrationDetail.value = null;
    void loadMigrations();
  }

  async function loadMutationStatusAndReconnect(): Promise<void> {
    try {
      const snapshot = await fetchProjectRailsMigrationPtyStatus(
        getProject().id,
      );
      mutationSnapshot.value = snapshot;
      if (snapshot)
        connectMutation(projectRailsMigrationPtyWebSocketUrl(getProject().id));
    } catch {
      // best-effort: se a consulta inicial falhar, os botões de operação ainda funcionam.
    }
  }

  async function runMigrationMutation(
    operation: RailsMigrationMutationOperation,
  ): Promise<void> {
    if (mutationRunning.value) return;
    const confirmed = await confirmDialog({
      title: `${mutationConfirmLabels[operation]}?`,
      message: mutationConfirmationText[operation],
      confirmLabel: mutationConfirmLabels[operation],
      tone: operation === 'rollback' ? 'danger' : 'warning',
    });
    if (!confirmed) return;

    mutationRunning.value = operation;
    mutationErrorMessage.value = '';
    disposeMutationTerminal();
    try {
      mutationSnapshot.value = await startProjectRailsMigrationPty(
        getProject().id,
        operation,
      );
      connectMutation(projectRailsMigrationPtyWebSocketUrl(getProject().id));
    } catch (error) {
      mutationErrorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível iniciar a operação.';
      await loadMutationStatusAndReconnect();
    } finally {
      mutationRunning.value = '';
    }
  }

  async function cancelMigrationMutation(): Promise<void> {
    mutationCancelling.value = true;
    try {
      await cancelProjectRailsMigrationPty(getProject().id);
    } catch (error) {
      mutationErrorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível cancelar a operação.';
    } finally {
      mutationCancelling.value = false;
    }
  }

  watch(
    () => getProject().id,
    () => {
      generation += 1;
      migrations.value = null;
      migrationDetail.value = null;
      selectedMigrationVersion.value = '';
      selectedDatabase.value = 'primary';
      mutationRunning.value = '';
      mutationErrorMessage.value = '';
      mutationSnapshot.value = null;
      disconnectMutation();
      disposeMutationTerminal();
      void loadMigrations();
      void loadMutationStatusAndReconnect();
    },
    { immediate: true },
  );

  return {
    migrations,
    migrationsLoading,
    migrationsErrorMessage,
    migrationDetail,
    migrationDetailLoading,
    migrationDetailErrorMessage,
    selectedMigrationVersion,
    selectedDatabase,
    mutationRunning,
    mutationSnapshot,
    mutationErrorMessage,
    mutationConnecting,
    mutationCancelling,
    mutationTerminalContainer,
    mutationLabels,
    loadMigrations,
    selectMigration,
    selectDatabase,
    runMigrationMutation,
    cancelMigrationMutation,
  };
}
