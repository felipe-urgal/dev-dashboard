import { computed, ref } from 'vue';

import {
  fetchAgentTaskPage,
  type AgentTaskPage,
  type AgentTaskRecord,
} from '../api/agent-runtime';

const PAGE_SIZE = 20;

/**
 * Paginated task history for one project. Each request is capped by the API;
 * explicit task selections and runtime snapshots can still be pinned locally.
 */
export function useAgentTaskHistory(
  projectId: () => string,
  fetchPage: typeof fetchAgentTaskPage = fetchAgentTaskPage,
) {
  const tasks = ref<AgentTaskRecord[]>([]);
  const nextCursor = ref<string | null>(null);
  const historyLoading = ref(false);
  const historyLoaded = ref(false);
  const historyError = ref('');
  const showArchived = ref(false);
  let version = 0;

  const historyHasMore = computed(() => nextCursor.value !== null);

  function resetHistory(): void {
    version += 1;
    tasks.value = [];
    nextCursor.value = null;
    historyLoading.value = false;
    historyLoaded.value = false;
    historyError.value = '';
  }

  function upsertTask(record: AgentTaskRecord): void {
    if (record.task.projectId !== projectId()) return;
    if (record.task.archivedAt && !showArchived.value) {
      tasks.value = tasks.value.filter(
        (item) => item.task.id !== record.task.id,
      );
      return;
    }
    const index = tasks.value.findIndex(
      (item) => item.task.id === record.task.id,
    );
    if (index < 0) {
      tasks.value = [record, ...tasks.value];
      return;
    }
    tasks.value = tasks.value.map((item, itemIndex) =>
      itemIndex === index && record.version >= item.version ? record : item,
    );
  }

  function applyPage(page: AgentTaskPage): void {
    for (const record of page.tasks) upsertTask(record);
    nextCursor.value = page.nextCursor;
    historyLoaded.value = true;
  }

  async function loadFirstPage(): Promise<AgentTaskRecord[]> {
    resetHistory();
    const requestVersion = version;
    const requestProject = projectId();
    historyLoading.value = true;
    try {
      const page = await fetchPage(requestProject, {
        limit: PAGE_SIZE,
        order: 'priority',
        includeArchived: showArchived.value,
      });
      if (requestVersion !== version || projectId() !== requestProject) {
        return [];
      }
      applyPage(page);
      return page.tasks;
    } catch (error) {
      if (requestVersion !== version || projectId() !== requestProject) {
        return [];
      }
      historyError.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível carregar o histórico.';
      throw error;
    } finally {
      if (requestVersion === version && projectId() === requestProject) {
        historyLoading.value = false;
      }
    }
  }

  async function loadNextPage(): Promise<void> {
    const cursor = nextCursor.value;
    if (!cursor || historyLoading.value) return;
    const requestVersion = version;
    const requestProject = projectId();
    historyLoading.value = true;
    historyError.value = '';
    try {
      const page = await fetchPage(requestProject, {
        limit: PAGE_SIZE,
        cursor,
        order: 'priority',
        includeArchived: showArchived.value,
      });
      if (requestVersion !== version || projectId() !== requestProject) {
        return;
      }
      applyPage(page);
    } catch (error) {
      if (requestVersion !== version || projectId() !== requestProject) {
        return;
      }
      historyError.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível carregar mais tasks.';
    } finally {
      if (requestVersion === version && projectId() === requestProject) {
        historyLoading.value = false;
      }
    }
  }

  async function setShowArchived(next: boolean): Promise<void> {
    if (showArchived.value === next) return;
    showArchived.value = next;
    await loadFirstPage();
  }

  return {
    tasks,
    showArchived,
    setShowArchived,
    nextCursor,
    historyLoading,
    historyLoaded,
    historyError,
    historyHasMore,
    resetHistory,
    upsertTask,
    loadFirstPage,
    loadNextPage,
  };
}
