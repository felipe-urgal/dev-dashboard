import { onBeforeUnmount, ref, watch } from 'vue';

import type {
  Project,
  ProjectEnvironmentContract,
} from '@dev-dashboard/contracts';

import { fetchProjectEnvironmentContract } from '../api';
import { RequestGeneration } from '../utils/request-generation';

export function useProjectEnvironmentContract(getProject: () => Project) {
  const contract = ref<ProjectEnvironmentContract | null>(null);
  const loading = ref(false);
  const errorMessage = ref('');
  const requests = new RequestGeneration();

  async function refresh(): Promise<void> {
    const projectId = getProject().id;
    const generation = requests.capture();
    loading.value = true;
    errorMessage.value = '';

    try {
      const result = await fetchProjectEnvironmentContract(projectId);
      if (getProject().id === projectId && requests.isCurrent(generation)) {
        contract.value = result;
      }
    } catch (error) {
      if (getProject().id === projectId && requests.isCurrent(generation)) {
        errorMessage.value =
          error instanceof Error
            ? error.message
            : 'Não foi possível consultar o contrato de ambiente.';
      }
    } finally {
      if (getProject().id === projectId && requests.isCurrent(generation)) {
        loading.value = false;
      }
    }
  }

  function initialize(): void {
    requests.invalidate();
    contract.value = null;
    loading.value = false;
    errorMessage.value = '';
    void refresh();
  }

  watch(() => getProject().id, initialize, { immediate: true });

  onBeforeUnmount(() => requests.invalidate());

  return { contract, loading, errorMessage, refresh };
}
