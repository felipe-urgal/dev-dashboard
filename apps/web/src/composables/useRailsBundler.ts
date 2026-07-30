import { ref, watch, type ComputedRef, type Ref } from 'vue';

import type {
  BundlerOverview,
  Project,
} from '@dev-dashboard/contracts';

import { fetchProjectBundler } from '../api';

export function useRailsBundler(
  getProject: () => Project,
  isRailsProject: Ref<boolean> | ComputedRef<boolean>,
) {
  const bundler = ref<BundlerOverview | null>(null);
  const bundlerLoading = ref(false);
  const bundlerErrorMessage = ref('');
  const selectedGemName = ref('');

  let generation = 0;

  async function loadBundler(): Promise<void> {
    if (!isRailsProject.value) return;
    const current = generation;
    bundlerLoading.value = true;
    bundlerErrorMessage.value = '';
    try {
      const result = await fetchProjectBundler(getProject().id);
      if (current !== generation) return;
      bundler.value = result;
      if (!result.outdated.some((gem) => gem.name === selectedGemName.value)) {
        selectedGemName.value = result.outdated[0]?.name ?? '';
      }
    } catch (error) {
      if (current === generation) bundlerErrorMessage.value = error instanceof Error ? error.message : 'Não foi possível consultar o Bundler.';
    } finally {
      if (current === generation) bundlerLoading.value = false;
    }
  }

  watch(
    () => getProject().id,
    () => {
      generation += 1;
      bundler.value = null;
      selectedGemName.value = '';
      void loadBundler();
    },
    { immediate: true },
  );

  return {
    bundler,
    bundlerLoading,
    bundlerErrorMessage,
    selectedGemName,
    loadBundler,
  };
}
