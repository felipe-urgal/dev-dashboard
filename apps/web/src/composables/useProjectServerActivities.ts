import { onBeforeUnmount, ref, watch } from 'vue';

import type { Activity, Project } from '@dev-dashboard/contracts';

import { fetchActivities } from '../api';
import { RequestGate, RequestGeneration } from '../utils/request-generation';

export function useProjectServerActivities(getProject: () => Project) {
  const activities = ref<Activity[]>([]);
  const loadingActivities = ref(false);
  const activityErrorMessage = ref('');

  const projectRequests = new RequestGeneration();
  const activityRequestGate = new RequestGate();

  function isCurrentProject(projectId: string, generation: number): boolean {
    return (
      getProject().id === projectId &&
      projectRequests.isCurrent(generation)
    );
  }

  async function refreshActivities(): Promise<void> {
    const requestToken = activityRequestGate.begin('server-activity');
    if (!requestToken) return;

    const projectId = getProject().id;
    const generation = projectRequests.capture();
    loadingActivities.value = true;
    activityErrorMessage.value = '';

    try {
      const result = await fetchActivities({
        projectId,
        origin: 'server',
        page: 1,
        pageSize: 4,
      });

      if (isCurrentProject(projectId, generation)) {
        activities.value = result.items;
      }
    } catch (error) {
      if (isCurrentProject(projectId, generation)) {
        activityErrorMessage.value =
          error instanceof Error
            ? error.message
            : 'Não foi possível carregar a atividade recente.';
      }
    } finally {
      if (
        activityRequestGate.finish(requestToken) &&
        isCurrentProject(projectId, generation)
      ) {
        loadingActivities.value = false;
      }
    }
  }

  function reset(): void {
    projectRequests.invalidate();
    activityRequestGate.invalidate();
    activities.value = [];
    loadingActivities.value = false;
    activityErrorMessage.value = '';
  }

  watch(
    () => getProject().id,
    () => {
      reset();
      void refreshActivities();
    },
    { immediate: true },
  );

  onBeforeUnmount(() => {
    projectRequests.invalidate();
    activityRequestGate.invalidate();
  });

  return {
    activities,
    loadingActivities,
    activityErrorMessage,
    refreshActivities,
  };
}
