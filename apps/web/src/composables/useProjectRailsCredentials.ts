import { onBeforeUnmount, ref, watch } from 'vue';

import type { Project, RailsCredentialsOverview } from '@dev-dashboard/contracts';

import { fetchProjectRailsCredentials } from '../api';
import { RequestGeneration } from '../utils/request-generation';

/**
 * Status somente leitura das credentials Rails criptografadas. Nunca busca
 * nem expõe o conteúdo do arquivo `.yml.enc` nem o valor de nenhuma chave —
 * apenas se os arquivos existem (ver task 095).
 */
export function useProjectRailsCredentials(getProject: () => Project) {
  const credentials = ref<RailsCredentialsOverview | null>(null);
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
      const overview = await fetchProjectRailsCredentials(projectId);
      if (isCurrentProject(projectId, generation)) {
        credentials.value = overview;
      }
    } catch (error) {
      if (isCurrentProject(projectId, generation)) {
        errorMessage.value =
          error instanceof Error ? error.message : 'Não foi possível consultar as credentials.';
      }
    } finally {
      if (isCurrentProject(projectId, generation)) {
        loading.value = false;
      }
    }
  }

  async function initialize(): Promise<void> {
    projectRequests.invalidate();
    credentials.value = null;
    loading.value = false;
    errorMessage.value = '';
    await refresh();
  }

  watch(() => getProject().id, () => { void initialize(); }, { immediate: true });

  onBeforeUnmount(() => {
    projectRequests.invalidate();
  });

  return { credentials, loading, errorMessage, refresh };
}
