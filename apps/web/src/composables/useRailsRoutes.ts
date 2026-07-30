import { ref, watch, type ComputedRef, type Ref } from 'vue';

import type {
  Project,
  RailsRouteEntry,
  RailsRoutesOverview,
} from '@dev-dashboard/contracts';

import { fetchProjectRailsRoutes } from '../api';

export function routeKey(route: RailsRouteEntry, index = 0): string {
  return `${route.verb}:${route.path}:${route.controllerAction}:${route.name ?? ''}:${index}`;
}

export function useRailsRoutes(
  getProject: () => Project,
  isRailsProject: Ref<boolean> | ComputedRef<boolean>,
) {
  const routes = ref<RailsRoutesOverview | null>(null);
  const routesLoading = ref(false);
  const routesErrorMessage = ref('');
  const selectedRouteKey = ref('');

  let generation = 0;

  async function loadRoutes(): Promise<void> {
    if (!isRailsProject.value) return;
    const current = generation;
    routesLoading.value = true;
    routesErrorMessage.value = '';
    try {
      const result = await fetchProjectRailsRoutes(getProject().id);
      if (current !== generation) return;
      routes.value = result;
      if (!selectedRouteKey.value && result.routes[0]) selectedRouteKey.value = routeKey(result.routes[0], 0);
    } catch (error) {
      if (current === generation) routesErrorMessage.value = error instanceof Error ? error.message : 'Não foi possível consultar as rotas.';
    } finally {
      if (current === generation) routesLoading.value = false;
    }
  }

  function selectRoute(route: RailsRouteEntry, index: number): void {
    selectedRouteKey.value = routeKey(route, index);
  }

  watch(
    () => getProject().id,
    () => {
      generation += 1;
      routes.value = null;
      selectedRouteKey.value = '';
      void loadRoutes();
    },
    { immediate: true },
  );

  return {
    routes,
    routesLoading,
    routesErrorMessage,
    selectedRouteKey,
    loadRoutes,
    selectRoute,
  };
}
