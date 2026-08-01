import { ref, watch, type ComputedRef, type Ref } from 'vue';

import type {
  Project,
  RailsMigrationDetail,
  RailsMigrationEntry,
  RailsMigrationMutationOperation,
  RailsMigrationsOverview,
} from '@dev-dashboard/contracts';

import {
  fetchProjectRailsMigrations,
  prepareProjectRailsMutation,
  runProjectRailsMutation,
} from '../api';
import { fetchProjectRailsMigrationDetail } from '../rails-explorer-api';

const mutationLabels: Record<RailsMigrationMutationOperation, string> = {
  migrate: 'Rodar migrations pendentes (db:migrate)',
  rollback: 'Desfazer a última migration (db:rollback, 1 passo)',
  seed: 'Rodar seeds (db:seed)',
  prepare: 'Preparar o banco (db:prepare)',
};

const mutationConfirmationText: Record<RailsMigrationMutationOperation, string> = {
  migrate: 'Rodar todas as migrations pendentes neste banco?',
  rollback: 'Desfazer a última migration aplicada (um passo)? Isso pode apagar dados dessa migration.',
  seed: 'Rodar db:seed neste banco? Scripts de seed podem criar ou alterar dados.',
  prepare: 'Rodar db:prepare neste banco? Isso pode criar o banco e carregar o schema mais recente.',
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

  const mutationRunning = ref<RailsMigrationMutationOperation | ''>('');
  const mutationMessage = ref('');
  const mutationErrorMessage = ref('');
  const mutationOutput = ref('');

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
      const result = await fetchProjectRailsMigrationDetail(getProject().id, version, database);
      if (current === generation && selectedMigrationVersion.value === version && selectedDatabase.value === database) migrationDetail.value = result;
    } catch (error) {
      if (current === generation) migrationDetailErrorMessage.value = error instanceof Error ? error.message : 'Não foi possível carregar os detalhes da migration.';
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
      const result = await fetchProjectRailsMigrations(getProject().id, selectedDatabase.value);
      if (current !== generation) return;
      migrations.value = result;
      const preferred = result.migrations.find((item) => item.version === selectedMigrationVersion.value)
        ?? result.migrations.find((item) => item.status === 'down')
        ?? result.migrations[0];
      selectedMigrationVersion.value = preferred?.version ?? '';
      if (preferred) await loadMigrationDetail(preferred.version);
    } catch (error) {
      if (current === generation) migrationsErrorMessage.value = error instanceof Error ? error.message : 'Não foi possível consultar as migrations.';
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

  async function runMigrationMutation(operation: RailsMigrationMutationOperation): Promise<void> {
    if (mutationRunning.value) return;
    const confirmed = typeof window === 'undefined' || window.confirm(mutationConfirmationText[operation]);
    if (!confirmed) return;

    mutationRunning.value = operation;
    mutationMessage.value = '';
    mutationErrorMessage.value = '';
    mutationOutput.value = '';
    try {
      const confirmation = await prepareProjectRailsMutation(getProject().id, operation);
      const result = await runProjectRailsMutation(getProject().id, operation, confirmation.token);
      mutationOutput.value = result.output;
      if (result.succeeded) mutationMessage.value = `${mutationLabels[operation]} concluído.`;
      else mutationErrorMessage.value = `${mutationLabels[operation]} falhou. Veja a saída abaixo.`;
      await loadMigrations();
    } catch (error) {
      mutationErrorMessage.value = error instanceof Error ? error.message : 'Não foi possível concluir a operação.';
    } finally {
      mutationRunning.value = '';
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
      mutationMessage.value = '';
      mutationErrorMessage.value = '';
      mutationOutput.value = '';
      void loadMigrations();
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
    mutationMessage,
    mutationErrorMessage,
    mutationOutput,
    mutationLabels,
    loadMigrations,
    selectMigration,
    selectDatabase,
    runMigrationMutation,
  };
}
