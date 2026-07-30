import { ref, watch } from 'vue';

import type {
  Project,
  ProjectDatabaseOverview,
} from '@dev-dashboard/contracts';

import {
  fetchProjectDatabase,
  revealProjectDatabaseUrl,
  startProjectDatabase,
} from '../api';

export function useProjectDatabaseOverview(getProject: () => Project) {
  const overview = ref<ProjectDatabaseOverview | null>(null);
  const loading = ref(false);
  const errorMessage = ref('');
  const revealed = ref<Record<string, string>>({});
  const page = ref(1);
  const starting = ref<Record<string, boolean>>({});
  const selectedEnvironmentId = ref('');

  let generation = 0;

  async function loadDatabase(targetPage = page.value): Promise<void> {
    const current = generation;
    loading.value = true;
    errorMessage.value = '';
    try {
      const result = await fetchProjectDatabase(getProject().id, targetPage);
      if (current !== generation) return;
      overview.value = result;
      page.value = targetPage;
      if (!result.environments.some((item) => item.id === selectedEnvironmentId.value)) {
        selectedEnvironmentId.value = result.environments[0]?.id ?? '';
      }
    } catch (error) {
      if (current === generation) errorMessage.value = error instanceof Error ? error.message : 'Não foi possível consultar os bancos.';
    } finally {
      if (current === generation) loading.value = false;
    }
  }

  async function reveal(id: string): Promise<void> {
    if (revealed.value[id]) {
      const next = { ...revealed.value };
      delete next[id];
      revealed.value = next;
      return;
    }

    const current = generation;
    try {
      const secret = await revealProjectDatabaseUrl(getProject().id, id);
      if (current === generation) revealed.value = { ...revealed.value, [id]: secret.databaseUrl };
    } catch (error) {
      if (current === generation) errorMessage.value = error instanceof Error ? error.message : 'Não foi possível revelar a URL.';
    }
  }

  async function start(id: string): Promise<void> {
    const current = generation;
    starting.value = { ...starting.value, [id]: true };
    errorMessage.value = '';
    try {
      await startProjectDatabase(getProject().id, id);
      if (current === generation) await loadDatabase();
    } catch (error) {
      if (current === generation) errorMessage.value = error instanceof Error ? error.message : 'Não foi possível iniciar o banco.';
    } finally {
      if (current === generation) starting.value = { ...starting.value, [id]: false };
    }
  }

  watch(
    () => getProject().id,
    () => {
      generation += 1;
      overview.value = null;
      revealed.value = {};
      starting.value = {};
      page.value = 1;
      selectedEnvironmentId.value = '';
      void loadDatabase(1);
    },
    { immediate: true },
  );

  return {
    overview,
    loading,
    errorMessage,
    revealed,
    page,
    starting,
    selectedEnvironmentId,
    loadDatabase,
    reveal,
    start,
  };
}
