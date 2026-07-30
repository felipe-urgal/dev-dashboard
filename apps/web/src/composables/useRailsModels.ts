import { ref, watch, type ComputedRef, type Ref } from 'vue';

import type {
  Project,
  RailsModelsOverview,
} from '@dev-dashboard/contracts';

import { fetchProjectRailsModels } from '../rails-explorer-api';

export function useRailsModels(
  getProject: () => Project,
  isRailsProject: Ref<boolean> | ComputedRef<boolean>,
) {
  const models = ref<RailsModelsOverview | null>(null);
  const modelsLoading = ref(false);
  const modelsErrorMessage = ref('');
  const selectedTableName = ref('');

  let generation = 0;

  async function loadModels(): Promise<void> {
    if (!isRailsProject.value) return;
    const current = generation;
    modelsLoading.value = true;
    modelsErrorMessage.value = '';
    try {
      const result = await fetchProjectRailsModels(getProject().id);
      if (current !== generation) return;
      models.value = result;
      if (!result.tables.some((table) => table.name === selectedTableName.value)) {
        selectedTableName.value = result.tables[0]?.name ?? '';
      }
    } catch (error) {
      if (current === generation) modelsErrorMessage.value = error instanceof Error ? error.message : 'Não foi possível consultar os modelos.';
    } finally {
      if (current === generation) modelsLoading.value = false;
    }
  }

  watch(
    () => getProject().id,
    () => {
      generation += 1;
      models.value = null;
      selectedTableName.value = '';
      void loadModels();
    },
    { immediate: true },
  );

  return {
    models,
    modelsLoading,
    modelsErrorMessage,
    selectedTableName,
    loadModels,
  };
}
