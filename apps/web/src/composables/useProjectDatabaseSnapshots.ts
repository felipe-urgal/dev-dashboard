import { computed, ref, watch, type Ref } from 'vue';

import type {
  DatabaseSnapshotList,
  Project,
} from '@dev-dashboard/contracts';

import {
  createProjectDatabaseSnapshot,
  fetchProjectDatabaseSnapshots,
  prepareProjectDatabaseRestore,
  restoreProjectDatabaseSnapshot,
} from '../api';

export function useProjectDatabaseSnapshots(
  getProject: () => Project,
  selectedEnvironmentId: Ref<string>,
) {
  const snapshots = ref<DatabaseSnapshotList | null>(null);
  const snapshotsLoading = ref(false);
  const snapshotsErrorMessage = ref('');
  const snapshotsMessage = ref('');
  const creatingSnapshot = ref(false);
  const restoringSnapshotId = ref('');
  /** Snapshot aguardando a segunda etapa da confirmação. */
  const pendingRestoreId = ref('');

  let generation = 0;

  const snapshotEnvironmentId = computed(() => {
    const supported = snapshots.value?.supportedEnvironmentIds ?? [];
    if (supported.includes(selectedEnvironmentId.value)) return selectedEnvironmentId.value;
    return supported[0] ?? '';
  });

  const snapshotsSupported = computed(() => snapshotEnvironmentId.value !== '');

  async function loadSnapshots(): Promise<void> {
    const current = generation;
    snapshotsLoading.value = true;
    snapshotsErrorMessage.value = '';
    try {
      const result = await fetchProjectDatabaseSnapshots(getProject().id);
      if (current === generation) snapshots.value = result;
    } catch (error) {
      if (current === generation) {
        snapshotsErrorMessage.value = error instanceof Error
          ? error.message
          : 'Não foi possível listar os snapshots.';
      }
    } finally {
      if (current === generation) snapshotsLoading.value = false;
    }
  }

  async function createSnapshot(): Promise<void> {
    if (!snapshotEnvironmentId.value || creatingSnapshot.value) return;
    const current = generation;
    creatingSnapshot.value = true;
    snapshotsErrorMessage.value = '';
    snapshotsMessage.value = '';
    try {
      const snapshot = await createProjectDatabaseSnapshot(getProject().id, snapshotEnvironmentId.value);
      if (current !== generation) return;
      snapshotsMessage.value = `Snapshot de "${snapshot.database}" criado.`;
      await loadSnapshots();
    } catch (error) {
      if (current === generation) {
        snapshotsErrorMessage.value = error instanceof Error
          ? error.message
          : 'Não foi possível gerar o snapshot.';
      }
    } finally {
      if (current === generation) creatingSnapshot.value = false;
    }
  }

  function requestRestore(snapshotId: string): void {
    pendingRestoreId.value = snapshotId;
    snapshotsMessage.value = '';
    snapshotsErrorMessage.value = '';
  }

  function cancelRestore(): void {
    pendingRestoreId.value = '';
  }

  /** Segunda etapa: pede o token e o consome na mesma ação do usuário. */
  async function confirmRestore(snapshotId: string): Promise<void> {
    if (restoringSnapshotId.value) return;
    const current = generation;
    restoringSnapshotId.value = snapshotId;
    snapshotsErrorMessage.value = '';
    snapshotsMessage.value = '';
    try {
      const confirmation = await prepareProjectDatabaseRestore(getProject().id, snapshotId);
      await restoreProjectDatabaseSnapshot(getProject().id, snapshotId, confirmation.token);
      if (current !== generation) return;
      pendingRestoreId.value = '';
      snapshotsMessage.value = 'Banco restaurado a partir do snapshot.';
    } catch (error) {
      if (current === generation) {
        snapshotsErrorMessage.value = error instanceof Error
          ? error.message
          : 'Não foi possível restaurar o snapshot.';
      }
    } finally {
      if (current === generation) restoringSnapshotId.value = '';
    }
  }

  watch(
    () => getProject().id,
    () => {
      generation += 1;
      snapshots.value = null;
      snapshotsMessage.value = '';
      snapshotsErrorMessage.value = '';
      pendingRestoreId.value = '';
      void loadSnapshots();
    },
    { immediate: true },
  );

  return {
    snapshots,
    snapshotsLoading,
    snapshotsErrorMessage,
    snapshotsMessage,
    snapshotsSupported,
    snapshotEnvironmentId,
    creatingSnapshot,
    restoringSnapshotId,
    pendingRestoreId,
    loadSnapshots,
    createSnapshot,
    requestRestore,
    cancelRestore,
    confirmRestore,
  };
}
