import { onBeforeUnmount, ref, watch } from 'vue';

import type { GitMutationHistoryPage, Project } from '@dev-dashboard/contracts';

import { fetchProjectGitMutationHistory } from '../api';
import { clearProjectGitMutationHistory } from '../api/git-mutation-history';
import { confirmDialog } from '../stores/app-dialog';
import { RequestGeneration } from '../utils/request-generation';

const PAGE_SIZE = 10;

/**
 * Visão compacta do histórico de mutações Git de um projeto — resultado de
 * cada tentativa (sucesso/falha), risco do catálogo e instante do servidor.
 * Não substitui o "Histórico de commits" (`ProjectGitHistoryPage.vue`): este
 * painel mostra tentativas de mutação, aquele mostra commits já registrados.
 */
export function useProjectGitMutationHistoryPanel(getProject: () => Project) {
  const page = ref<GitMutationHistoryPage | null>(null);
  const currentPage = ref(1);
  const loading = ref(false);
  const clearing = ref(false);
  const errorMessage = ref('');

  const projectRequests = new RequestGeneration();

  function isCurrentProject(projectId: string, generation: number): boolean {
    return (
      getProject().id === projectId && projectRequests.isCurrent(generation)
    );
  }

  async function refresh(): Promise<void> {
    const projectId = getProject().id;
    const generation = projectRequests.capture();
    loading.value = true;
    errorMessage.value = '';

    try {
      const result = await fetchProjectGitMutationHistory(
        projectId,
        currentPage.value,
        PAGE_SIZE,
      );
      if (isCurrentProject(projectId, generation)) {
        page.value = result;
      }
    } catch (error) {
      if (isCurrentProject(projectId, generation)) {
        errorMessage.value =
          error instanceof Error
            ? error.message
            : 'Não foi possível consultar o histórico de mutações.';
      }
    } finally {
      if (isCurrentProject(projectId, generation)) {
        loading.value = false;
      }
    }
  }

  async function clearHistory(): Promise<void> {
    if (clearing.value || (page.value?.total ?? 0) === 0) return;
    const confirmed = await confirmDialog({
      title: 'Limpar histórico de mutações?',
      message:
        'Os registros de alterações Git deste projeto serão removidos. O histórico de commits não será alterado.',
      confirmLabel: 'Limpar histórico',
      tone: 'danger',
    });
    if (!confirmed) return;

    const projectId = getProject().id;
    const generation = projectRequests.capture();
    clearing.value = true;
    errorMessage.value = '';
    try {
      await clearProjectGitMutationHistory(projectId);
      if (!isCurrentProject(projectId, generation)) return;
      currentPage.value = 1;
      await refresh();
    } catch (error) {
      if (isCurrentProject(projectId, generation)) {
        errorMessage.value =
          error instanceof Error
            ? error.message
            : 'Não foi possível limpar o histórico de mutações.';
      }
    } finally {
      if (isCurrentProject(projectId, generation)) clearing.value = false;
    }
  }

  async function initialize(): Promise<void> {
    projectRequests.invalidate();
    page.value = null;
    currentPage.value = 1;
    loading.value = false;
    clearing.value = false;
    errorMessage.value = '';
    await refresh();
  }

  async function goToPage(next: number): Promise<void> {
    if (next < 1) return;
    if (page.value && next > page.value.totalPages) return;
    currentPage.value = next;
    await refresh();
  }

  watch(
    () => getProject().id,
    () => {
      void initialize();
    },
    { immediate: true },
  );

  onBeforeUnmount(() => {
    projectRequests.invalidate();
  });

  return {
    page,
    currentPage,
    loading,
    clearing,
    errorMessage,
    refresh,
    clearHistory,
    goToPage,
  };
}
