<script setup lang="ts">
import {
  computed,
  ref,
  watch,
} from 'vue';
import {
  MagnifyingGlassIcon,
  PlayIcon,
  StopIcon,
  XMarkIcon,
} from '@heroicons/vue/24/outline';

import type { ProjectType } from '@dev-dashboard/contracts';

import Card from '../components/Card.vue';
import ProjectCard from '../components/ProjectCard.vue';
import { useAutoDismiss } from '../composables/useAutoDismiss';
import { dashboardStore } from '../stores/dashboard';
import {
  fetchManagedProcesses,
  startProjectProcess,
  stopProjectProcess,
} from '../api';

const {
  projects,
  loadingProjects,
  scanningWorkspace,
  deletingWorkspace,
  errorMessage,
  successMessage,
  warningCount,
  lastScannedPath,
  selectedWorkspaceId,
  sortedProjects,
  scanSelectedWorkspace,
  handleDeleteWorkspace,
} = dashboardStore;

useAutoDismiss(errorMessage, '');
useAutoDismiss(successMessage, '');
useAutoDismiss(warningCount, 0);

type ProjectFilter = 'all' | ProjectType;

const projectSearch = ref('');
const projectFilter = ref<ProjectFilter>('all');
const activeServerProjectIds = ref(new Set<string>());
const stoppableServerProjectIds = ref(new Set<string>());
const loadingServerStatuses = ref(false);
const serverStatusesLoaded = ref(false);
const startingAllServers = ref(false);
const serversBeingStarted = ref(0);
const stoppingAllServers = ref(false);
const serversBeingStopped = ref(0);

let serverStatusRequest = 0;

const projectTypeFilters: Array<{
  value: ProjectFilter;
  label: string;
}> = [
  { value: 'all', label: 'Todos' },
  { value: 'rails', label: 'Rails' },
  { value: 'node', label: 'Node' },
];

const normalizedProjectSearch = computed(() =>
  projectSearch.value.trim().toLocaleLowerCase('pt-BR'),
);

const filteredProjects = computed(() =>
  sortedProjects.value.filter((project) => {
    const matchesType =
      projectFilter.value === 'all' ||
      project.type === projectFilter.value;
    const matchesSearch =
      normalizedProjectSearch.value.length === 0 ||
      project.name
        .toLocaleLowerCase('pt-BR')
        .includes(normalizedProjectSearch.value) ||
      project.path
        .toLocaleLowerCase('pt-BR')
        .includes(normalizedProjectSearch.value);

    return matchesType && matchesSearch;
  }),
);

const hasActiveProjectFilters = computed(
  () =>
    projectFilter.value !== 'all' ||
    normalizedProjectSearch.value.length > 0,
);

const projectsWithServer = computed(() =>
  sortedProjects.value.filter((project) =>
    project.capabilities.includes('server'),
  ),
);

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

function clearProjectFilters(): void {
  projectSearch.value = '';
  projectFilter.value = 'all';
}

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
</script>

<template>
  <section id="overview" class="content">
    <div v-if="errorMessage" class="alert alert-error" role="alert">
      <div class="alert-body">
        <strong>Não foi possível concluir a ação.</strong>
        <span>{{ errorMessage }}</span>
      </div>
      <button
        type="button"
        class="alert-dismiss"
        aria-label="Fechar aviso"
        @click="errorMessage = ''"
      >
        ×
      </button>
    </div>

    <div v-if="successMessage" class="alert alert-success" role="status">
      <div class="alert-body">
        <strong>Ação concluída.</strong>
        <span>{{ successMessage }}</span>
      </div>
      <button
        type="button"
        class="alert-dismiss"
        aria-label="Fechar aviso"
        @click="successMessage = ''"
      >
        ×
      </button>
    </div>

    <div v-if="warningCount > 0" class="alert alert-warning">
      <div class="alert-body">
        <strong>Scan concluído com avisos.</strong>
        <span>
          {{ warningCount }} diretório(s) não puderam ser analisados.
        </span>
      </div>
      <button
        type="button"
        class="alert-dismiss"
        aria-label="Fechar aviso"
        @click="warningCount = 0"
      >
        ×
      </button>
    </div>

    <div v-if="lastScannedPath" class="scan-result">
      <span>
        Workspace carregado:
        <code>{{ lastScannedPath }}</code>
      </span>

      <div class="workspace-actions">
        <button
          class="secondary-button"
          type="button"
          :disabled="scanningWorkspace"
          @click="scanSelectedWorkspace"
        >
          {{ scanningWorkspace ? 'Escaneando...' : 'Escanear novamente' }}
        </button>

        <button
          class="danger-button"
          type="button"
          :disabled="deletingWorkspace"
          @click="handleDeleteWorkspace"
        >
          {{ deletingWorkspace ? 'Removendo...' : 'Remover' }}
        </button>
      </div>
    </div>

    <Card id="repositories" class="repositories-section">
      <template #header>
        <div>
          <span class="section-kicker">Repositórios</span>
          <h2>Projetos detectados</h2>
        </div>
      </template>
      <template #actions>
        <div class="repositories-actions">
          <span class="section-count">
            {{ projects.length }}
            {{ projects.length === 1 ? 'projeto' : 'projetos' }}
          </span>

          <div
            v-if="projectsWithServer.length > 0"
            class="servers-actions"
          >
            <button
              type="button"
              class="primary-button servers-action-button servers-start-button"
              :disabled="
                loadingServerStatuses ||
                !serverStatusesLoaded ||
                serverActionInProgress ||
                startableServerProjects.length === 0
              "
              :title="serverStartActionTitle"
              @click="handleStartAllServers"
            >
              <PlayIcon aria-hidden="true" />
              <span>
                {{
                  startingAllServers
                    ? `Iniciando ${serversBeingStarted}...`
                    : 'Iniciar servidores'
                }}
              </span>
            </button>

            <button
              type="button"
              class="danger-button servers-action-button servers-stop-button"
              :disabled="
                loadingServerStatuses ||
                !serverStatusesLoaded ||
                serverActionInProgress ||
                stoppableServerProjects.length === 0
              "
              :title="serverStopActionTitle"
              @click="handleStopAllServers"
            >
              <StopIcon aria-hidden="true" />
              <span>
                {{
                  stoppingAllServers
                    ? `Parando ${serversBeingStopped}...`
                    : 'Parar servidores'
                }}
              </span>
            </button>
          </div>
        </div>
      </template>

      <div
        v-if="!loadingProjects && sortedProjects.length > 0"
        class="projects-toolbar"
      >
        <div class="project-search">
          <label class="sr-only" for="project-search-input">
            Buscar projetos
          </label>
          <MagnifyingGlassIcon aria-hidden="true" />
          <input
            id="project-search-input"
            v-model="projectSearch"
            type="search"
            placeholder="Buscar por nome ou caminho"
          />
          <button
            v-if="projectSearch"
            type="button"
            aria-label="Limpar busca"
            @click="projectSearch = ''"
          >
              <XMarkIcon aria-hidden="true" />
          </button>
        </div>

        <div class="project-type-filters" aria-label="Filtrar por tecnologia">
          <button
            v-for="filter in projectTypeFilters"
            :key="filter.value"
            type="button"
            :class="{ active: projectFilter === filter.value }"
            :aria-pressed="projectFilter === filter.value"
            @click="projectFilter = filter.value"
          >
            {{ filter.label }}
          </button>
        </div>
      </div>

      <div v-if="loadingProjects" class="empty-state">
        <div class="empty-icon">•••</div>
        <h3>Carregando projetos</h3>
        <p>Consultando a API local.</p>
      </div>

      <div
        v-else-if="sortedProjects.length === 0"
        class="empty-state"
      >
        <div class="empty-icon">◇</div>
        <h3>Nenhum projeto carregado</h3>
        <p>
          Cadastre ou selecione um workspace na barra lateral para
          detectar aplicações Rails e Node.
        </p>
      </div>

      <div
        v-else-if="filteredProjects.length === 0"
        class="empty-state empty-state-filtered"
      >
        <MagnifyingGlassIcon class="empty-state-icon" aria-hidden="true" />
        <h3>Nenhum projeto encontrado</h3>
        <p>Tente outro nome ou remova os filtros aplicados.</p>
        <button
          v-if="hasActiveProjectFilters"
          type="button"
          class="secondary-button"
          @click="clearProjectFilters"
        >
          Limpar filtros
        </button>
      </div>

      <ul v-else class="projects-list">
        <ProjectCard
          v-for="project in filteredProjects"
          :key="project.id"
          :project="project"
        />
      </ul>
    </Card>
  </section>
</template>
