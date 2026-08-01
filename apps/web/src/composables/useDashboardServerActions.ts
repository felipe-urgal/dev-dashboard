import { computed, ref, watch, type ComputedRef, type Ref } from 'vue';

import type { Project } from '@dev-dashboard/contracts';

import {
  fetchManagedProcesses,
  startProjectProcess,
  stopProjectProcess,
} from '../api';

export interface UseDashboardServerActionsOptions {
  projectsWithServer: ComputedRef<Project[]>;
  selectedWorkspaceId: Ref<string>;
  errorMessage: Ref<string>;
  successMessage: Ref<string>;
}

/**
 * Estado e ações de "iniciar/parar todos os servidores" da visão geral:
 * status observado dos processos gerenciados e as ações em lote, isoladas
 * da busca/filtro de projetos (que não dependem disso).
 */
export function useDashboardServerActions(
  options: UseDashboardServerActionsOptions,
) {
  const { projectsWithServer, selectedWorkspaceId, errorMessage, successMessage } = options;

  const activeServerProjectIds = ref(new Set<string>());
  const stoppableServerProjectIds = ref(new Set<string>());
  const loadingServerStatuses = ref(false);
  const serverStatusesLoaded = ref(false);
  const startingAllServers = ref(false);
  const serversBeingStarted = ref(0);
  const stoppingAllServers = ref(false);
  const serversBeingStopped = ref(0);

  let serverStatusRequest = 0;

  const startableServerProjects = computed(() =>
    projectsWithServer.value.filter(
      (project) => !activeServerProjectIds.value.has(project.id),
    ),
  );

  const stoppableServerProjects = computed(() =>
    projectsWithServer.value.filter(
      (project) => stoppableServerProjectIds.value.has(project.id),
    ),
  );

  const serverActionInProgress = computed(
    () => startingAllServers.value || stoppingAllServers.value,
  );

  const serverStartActionTitle = computed(() => {
    if (loadingServerStatuses.value) {
      return 'Verificando servidores disponíveis.';
    }

    if (!serverStatusesLoaded.value) {
      return 'Não foi possível verificar os servidores disponíveis.';
    }

    if (startableServerProjects.value.length === 0) {
      return 'Todos os servidores disponíveis já estão em execução.';
    }

    const count = startableServerProjects.value.length;
    return `Iniciar ${count} ${count === 1 ? 'servidor parado' : 'servidores parados'}.`;
  });

  const serverStopActionTitle = computed(() => {
    if (loadingServerStatuses.value) {
      return 'Verificando servidores em execução.';
    }

    if (!serverStatusesLoaded.value) {
      return 'Não foi possível verificar os servidores em execução.';
    }

    if (stoppableServerProjects.value.length === 0) {
      return 'Nenhum servidor está em execução.';
    }

    const count = stoppableServerProjects.value.length;
    return `Parar ${count} ${count === 1 ? 'servidor ativo' : 'servidores ativos'}.`;
  });

  async function refreshServerStatuses(): Promise<void> {
    const request = ++serverStatusRequest;

    if (projectsWithServer.value.length === 0) {
      activeServerProjectIds.value = new Set();
      stoppableServerProjectIds.value = new Set();
      loadingServerStatuses.value = false;
      serverStatusesLoaded.value = false;
      return;
    }

    activeServerProjectIds.value = new Set();
    stoppableServerProjectIds.value = new Set();
    loadingServerStatuses.value = true;
    serverStatusesLoaded.value = false;

    try {
      const managedProcesses = await fetchManagedProcesses({
        ...(selectedWorkspaceId.value
          ? { workspaceId: selectedWorkspaceId.value }
          : {}),
        kind: 'server',
      });

      if (request !== serverStatusRequest) return;

      activeServerProjectIds.value = new Set(
        managedProcesses
          .filter((process) =>
            process.status === 'starting' ||
            process.status === 'running' ||
            process.status === 'stopping',
          )
          .map((process) => process.projectId),
      );
      stoppableServerProjectIds.value = new Set(
        managedProcesses
          .filter((process) =>
            process.status === 'starting' ||
            process.status === 'running',
          )
          .map((process) => process.projectId),
      );
      serverStatusesLoaded.value = true;
    } catch (error) {
      if (request !== serverStatusRequest) return;

      errorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível verificar os servidores disponíveis.';
    } finally {
      if (request === serverStatusRequest) {
        loadingServerStatuses.value = false;
      }
    }
  }

  async function handleStartAllServers(): Promise<void> {
    const projectsToStart = [...startableServerProjects.value];

    if (projectsToStart.length === 0 || serverActionInProgress.value) {
      return;
    }

    startingAllServers.value = true;
    serversBeingStarted.value = projectsToStart.length;
    errorMessage.value = '';
    successMessage.value = '';

    try {
      const results = await Promise.allSettled(
        projectsToStart.map((project) =>
          startProjectProcess(project.id),
        ),
      );

      const startedProjectIds = projectsToStart
        .filter((_, index) => results[index]?.status === 'fulfilled')
        .map((project) => project.id);
      const failedProjects = projectsToStart.filter(
        (_, index) => results[index]?.status === 'rejected',
      );

      activeServerProjectIds.value = new Set([
        ...activeServerProjectIds.value,
        ...startedProjectIds,
      ]);
      stoppableServerProjectIds.value = new Set([
        ...stoppableServerProjectIds.value,
        ...startedProjectIds,
      ]);

      if (failedProjects.length === 0) {
        successMessage.value =
          `${startedProjectIds.length} ` +
          `${startedProjectIds.length === 1 ? 'servidor iniciado' : 'servidores iniciados'}.`;
      } else {
        const failedNames = failedProjects
          .map((project) => project.name)
          .join(', ');
        const successSummary = startedProjectIds.length > 0
          ? startedProjectIds.length === 1
            ? '1 servidor iniciado. '
            : `${startedProjectIds.length} servidores iniciados. `
          : '';

        errorMessage.value =
          `${successSummary}Não foi possível iniciar: ${failedNames}.`;
      }
    } finally {
      startingAllServers.value = false;
      serversBeingStarted.value = 0;
    }
  }

  async function handleStopAllServers(): Promise<void> {
    const projectsToStop = [...stoppableServerProjects.value];

    if (projectsToStop.length === 0 || serverActionInProgress.value) {
      return;
    }

    stoppingAllServers.value = true;
    serversBeingStopped.value = projectsToStop.length;
    errorMessage.value = '';
    successMessage.value = '';

    try {
      const results = await Promise.allSettled(
        projectsToStop.map((project) =>
          stopProjectProcess(project.id),
        ),
      );

      const stoppedProjectIds = projectsToStop
        .filter((_, index) => results[index]?.status === 'fulfilled')
        .map((project) => project.id);
      const stoppedProjectIdSet = new Set(stoppedProjectIds);
      const failedProjects = projectsToStop.filter(
        (_, index) => results[index]?.status === 'rejected',
      );

      activeServerProjectIds.value = new Set(
        [...activeServerProjectIds.value].filter(
          (projectId) => !stoppedProjectIdSet.has(projectId),
        ),
      );
      stoppableServerProjectIds.value = new Set(
        [...stoppableServerProjectIds.value].filter(
          (projectId) => !stoppedProjectIdSet.has(projectId),
        ),
      );

      if (failedProjects.length === 0) {
        successMessage.value =
          `${stoppedProjectIds.length} ` +
          `${stoppedProjectIds.length === 1 ? 'servidor parado' : 'servidores parados'}.`;
      } else {
        const failedNames = failedProjects
          .map((project) => project.name)
          .join(', ');
        const successSummary = stoppedProjectIds.length > 0
          ? stoppedProjectIds.length === 1
            ? '1 servidor parado. '
            : `${stoppedProjectIds.length} servidores parados. `
          : '';

        errorMessage.value =
          `${successSummary}Não foi possível parar: ${failedNames}.`;
      }
    } finally {
      stoppingAllServers.value = false;
      serversBeingStopped.value = 0;
    }
  }

  watch(
    [
      selectedWorkspaceId,
      () => projectsWithServer.value.map((project) => project.id).join(','),
    ],
    () => {
      void refreshServerStatuses();
    },
    { immediate: true },
  );

  return {
    loadingServerStatuses,
    serverStatusesLoaded,
    startingAllServers,
    serversBeingStarted,
    stoppingAllServers,
    serversBeingStopped,
    startableServerProjects,
    stoppableServerProjects,
    serverActionInProgress,
    serverStartActionTitle,
    serverStopActionTitle,
    handleStartAllServers,
    handleStopAllServers,
  };
}
