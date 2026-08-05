import { onBeforeUnmount, ref, watch } from 'vue';

import type { Project, ProjectEnvironmentOverview } from '@dev-dashboard/contracts';

import { fetchProjectEnvironmentVariables } from '../api';
import { RequestGeneration } from '../utils/request-generation';

/**
 * Lista somente leitura das variáveis declaradas nos arquivos .env
 * reconhecidos do projeto. O valor de uma variável de nome sensível nunca
 * chega do servidor — ver ProjectEnvironmentService.
 */
export function useProjectEnvironmentVariables(getProject: () => Project) {
  const overview = ref<ProjectEnvironmentOverview | null>(null);
  const loading = ref(false);
  const errorMessage = ref('');

  const projectRequests = new RequestGeneration();

  function isCurrentProject(projectId: string, generation: number): boolean {
    return getProject().id === projectId && projectRequests.isCurrent(generation);
  }

  async function refresh(): Promise<void> {
    const projectId = getProject().id;
    const generation = projectRequests.capture();
    loading.value = true;
    errorMessage.value = '';

    try {
      const result = await fetchProjectEnvironmentVariables(projectId);
      if (isCurrentProject(projectId, generation)) {
        overview.value = result;
      }
    } catch (error) {
      if (isCurrentProject(projectId, generation)) {
        errorMessage.value =
          error instanceof Error ? error.message : 'Não foi possível consultar as variáveis de ambiente.';
      }
    } finally {
      if (isCurrentProject(projectId, generation)) {
        loading.value = false;
      }
    }
  }

  async function initialize(): Promise<void> {
    projectRequests.invalidate();
    overview.value = null;
    loading.value = false;
    errorMessage.value = '';
    await refresh();
  }

  watch(() => getProject().id, () => { void initialize(); }, { immediate: true });

  onBeforeUnmount(() => {
    projectRequests.invalidate();
  });

  return { overview, loading, errorMessage, refresh };
}
