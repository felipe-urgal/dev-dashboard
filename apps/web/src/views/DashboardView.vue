<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  ArrowPathIcon,
  CheckIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
  PlayIcon,
  StopIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/vue/24/outline';

import type { ProjectType } from '@dev-dashboard/contracts';

import Card from '../components/Card.vue';
import LoadingSkeleton from '../components/LoadingSkeleton.vue';
import ProjectCard from '../components/ProjectCard.vue';
import { useAutoDismiss } from '../composables/useAutoDismiss';
import { useDashboardServerActions } from '../composables/useDashboardServerActions';
import { dashboardStore } from '../stores/dashboard';
import {
  recentProjectIds,
  sortProjectsByPriority,
} from '../utils/project-priority';

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
  favoriteUpdatingIds,
  enabledUpdatingIds,
  dismissingProjectIds,
  rescanSelectedWorkspace,
  handleDeleteWorkspace,
  toggleProjectFavorite,
  toggleProjectEnabled,
  removeProject,
} = dashboardStore;

useAutoDismiss(errorMessage, '');
useAutoDismiss(successMessage, '');
useAutoDismiss(warningCount, 0);

type ProjectFilter = 'all' | ProjectType;

const projectSearch = ref('');
const projectFilter = ref<ProjectFilter>('all');
const filterMenu = ref<HTMLDetailsElement | null>(null);
const sortedProjects = computed(() => sortProjectsByPriority(projects.value));
const visibleRecentProjectIds = computed(() =>
  recentProjectIds(projects.value),
);

const projectTypeFilters: Array<{
  value: ProjectFilter;
  label: string;
}> = [
  { value: 'all', label: 'Todos' },
  { value: 'rails', label: 'Rails' },
  { value: 'node', label: 'Node' },
];

const activeProjectFilterLabel = computed(
  () =>
    projectTypeFilters.find((filter) => filter.value === projectFilter.value)
      ?.label ?? 'Todos',
);

const normalizedProjectSearch = computed(() =>
  projectSearch.value.trim().toLocaleLowerCase('pt-BR'),
);

const filteredProjects = computed(() =>
  sortedProjects.value.filter((project) => {
    const matchesType =
      projectFilter.value === 'all' || project.type === projectFilter.value;
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
    projectFilter.value !== 'all' || normalizedProjectSearch.value.length > 0,
);

const projectsWithServer = computed(() =>
  sortedProjects.value.filter(
    (project) => project.capabilities.includes('server') && project.enabled,
  ),
);

function selectProjectFilter(value: ProjectFilter): void {
  projectFilter.value = value;
  filterMenu.value?.removeAttribute('open');
}

function clearProjectFilters(): void {
  projectSearch.value = '';
  projectFilter.value = 'all';
}

const {
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
} = useDashboardServerActions({
  projectsWithServer,
  selectedWorkspaceId,
  errorMessage,
  successMessage,
});
</script>

<template>
  <section
    id="overview"
    class="content"
    :aria-busy="loadingProjects"
    aria-labelledby="overview-title"
  >
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

    <div
      v-if="warningCount > 0"
      class="alert alert-warning"
      role="status"
      aria-live="polite"
    >
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

    <Card id="repositories" class="repositories-section">
      <template #header>
        <div class="repository-heading">
          <span class="section-kicker">Repositórios</span>
          <div class="repository-title-row">
            <h2 id="overview-title">Projetos detectados</h2>
            <span v-if="!loadingProjects" class="section-count">
              {{ projects.length }}
              {{ projects.length === 1 ? 'projeto' : 'projetos' }}
            </span>
          </div>
        </div>
      </template>

      <template #actions>
        <div class="compact-actions" aria-label="Ações dos repositórios">
          <template v-if="lastScannedPath">
            <button
              class="compact-action-button"
              :class="{ 'compact-action-button-busy': scanningWorkspace }"
              type="button"
              :disabled="scanningWorkspace"
              :aria-label="
                scanningWorkspace
                  ? 'Escaneando workspace'
                  : 'Escanear novamente e restaurar projetos removidos'
              "
              :title="
                scanningWorkspace
                  ? 'Escaneando workspace'
                  : 'Escanear novamente e restaurar projetos removidos'
              "
              @click="rescanSelectedWorkspace"
            >
              <ArrowPathIcon aria-hidden="true" />
            </button>

            <button
              class="compact-action-button compact-action-button-danger"
              type="button"
              :disabled="deletingWorkspace"
              :aria-label="
                deletingWorkspace ? 'Removendo workspace' : 'Remover workspace'
              "
              :title="
                deletingWorkspace ? 'Removendo workspace' : 'Remover workspace'
              "
              @click="handleDeleteWorkspace"
            >
              <TrashIcon aria-hidden="true" />
            </button>
          </template>

          <span
            v-if="lastScannedPath && projectsWithServer.length > 0"
            class="compact-actions-separator"
            aria-hidden="true"
          />

          <template v-if="projectsWithServer.length > 0">
            <button
              type="button"
              class="compact-action-button compact-action-button-primary"
              :disabled="
                loadingServerStatuses ||
                !serverStatusesLoaded ||
                serverActionInProgress ||
                startableServerProjects.length === 0
              "
              :aria-label="
                startingAllServers
                  ? `Iniciando ${serversBeingStarted} servidores`
                  : 'Iniciar servidores'
              "
              :title="serverStartActionTitle"
              @click="handleStartAllServers"
            >
              <PlayIcon aria-hidden="true" />
            </button>

            <button
              type="button"
              class="compact-action-button compact-action-button-danger"
              :disabled="
                loadingServerStatuses ||
                !serverStatusesLoaded ||
                serverActionInProgress ||
                stoppableServerProjects.length === 0
              "
              :aria-label="
                stoppingAllServers
                  ? `Parando ${serversBeingStopped} servidores`
                  : 'Parar servidores'
              "
              :title="serverStopActionTitle"
              @click="handleStopAllServers"
            >
              <StopIcon aria-hidden="true" />
            </button>
          </template>

          <span
            v-if="
              sortedProjects.length > 0 &&
              (lastScannedPath || projectsWithServer.length > 0)
            "
            class="compact-actions-separator"
            aria-hidden="true"
          />

          <details
            v-if="sortedProjects.length > 0"
            ref="filterMenu"
            class="project-filter-menu"
            @keydown.esc.prevent="filterMenu?.removeAttribute('open')"
          >
            <summary
              class="compact-action-button project-filter-trigger"
              :class="{
                'compact-action-button-active': projectFilter !== 'all',
              }"
              :title="`Filtrar projetos: ${activeProjectFilterLabel}`"
            >
              <FunnelIcon aria-hidden="true" />
              <span class="sr-only">
                Filtrar projetos. Filtro atual: {{ activeProjectFilterLabel }}
              </span>
            </summary>

            <div class="project-filter-popover" role="menu">
              <button
                v-for="filter in projectTypeFilters"
                :key="filter.value"
                type="button"
                role="menuitemradio"
                :aria-checked="projectFilter === filter.value"
                @click="selectProjectFilter(filter.value)"
              >
                <span>{{ filter.label }}</span>
                <CheckIcon
                  v-if="projectFilter === filter.value"
                  aria-hidden="true"
                />
              </button>
            </div>
          </details>
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
      </div>

      <p
        v-if="hasActiveProjectFilters"
        class="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {{ filteredProjects.length }}
        {{
          filteredProjects.length === 1
            ? 'projeto encontrado'
            : 'projetos encontrados'
        }}.
      </p>

      <LoadingSkeleton
        v-if="loadingProjects"
        label="Carregando projetos detectados…"
        :rows="3"
      />

      <div v-else-if="sortedProjects.length === 0" class="empty-state">
        <div class="empty-icon">◇</div>
        <h3>Nenhum projeto carregado</h3>
        <p>
          Cadastre ou selecione um workspace na barra lateral para detectar
          aplicações Rails e Node.
        </p>
      </div>

      <div
        v-else-if="filteredProjects.length === 0"
        class="empty-state empty-state-filtered"
        role="status"
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
          :recent="visibleRecentProjectIds.has(project.id)"
          :favorite-updating="favoriteUpdatingIds.includes(project.id)"
          :enabled-updating="enabledUpdatingIds.includes(project.id)"
          :removing="dismissingProjectIds.includes(project.id)"
          @toggle-favorite="toggleProjectFavorite"
          @toggle-enabled="toggleProjectEnabled"
          @remove="removeProject"
        />
      </ul>
    </Card>
  </section>
</template>

<style scoped>
.repository-heading {
  min-width: 0;
}

.repository-title-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.repository-title-row h2 {
  margin-right: 2px;
}

.compact-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 7px;
}

.compact-action-button {
  display: inline-flex;
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-muted);
  background: var(--surface-2);
  cursor: pointer;
  transition:
    border-color 160ms ease,
    color 160ms ease,
    background 160ms ease,
    transform 160ms ease;
}

.compact-action-button:hover:not(:disabled) {
  border-color: var(--border-strong);
  color: var(--text);
  background: var(--surface-3);
  transform: translateY(-1px);
}

.compact-action-button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.compact-action-button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.compact-action-button svg {
  width: 16px;
  height: 16px;
}

.compact-action-button-primary {
  border-color: var(--accent);
  color: var(--info-text);
  background: var(--accent-soft);
}

.compact-action-button-danger {
  border-color: color-mix(in srgb, var(--danger-text) 45%, var(--border));
  color: var(--danger-text);
  background: var(--danger-surface);
}

.compact-action-button-active {
  border-color: var(--accent);
  color: var(--info-text);
  background: var(--accent-soft);
}

.compact-action-button-busy svg {
  animation: compact-action-spin 800ms linear infinite;
}

.compact-actions-separator {
  width: 1px;
  height: 24px;
  margin: 0 3px;
  background: var(--border);
}

.project-filter-menu {
  position: relative;
}

.project-filter-menu > summary {
  list-style: none;
}

.project-filter-menu > summary::-webkit-details-marker {
  display: none;
}

.project-filter-menu[open] > summary {
  border-color: var(--accent);
  color: var(--info-text);
  background: var(--accent-soft);
}

.project-filter-popover {
  position: absolute;
  z-index: 20;
  top: calc(100% + 8px);
  right: 0;
  display: grid;
  min-width: 148px;
  gap: 3px;
  padding: 6px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-1);
  box-shadow: 0 14px 36px rgb(15 23 42 / 16%);
}

.project-filter-popover button {
  display: flex;
  min-height: 34px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 7px 9px;
  border: 0;
  border-radius: 7px;
  color: var(--text-muted);
  background: transparent;
  font-size: var(--font-sm);
  font-weight: var(--font-weight-strong);
  text-align: left;
  cursor: pointer;
}

.project-filter-popover button:hover,
.project-filter-popover button:focus-visible {
  color: var(--text);
  background: var(--surface-2);
  outline: none;
}

.project-filter-popover button[aria-checked='true'] {
  color: var(--info-text);
  background: var(--accent-soft);
}

.project-filter-popover button svg {
  width: 15px;
  height: 15px;
  flex: 0 0 auto;
}

.projects-toolbar {
  justify-content: flex-start;
}

@keyframes compact-action-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 720px) {
  .compact-actions {
    width: 100%;
    justify-content: flex-start;
    flex-wrap: wrap;
  }

  .project-filter-popover {
    right: auto;
    left: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .compact-action-button-busy svg {
    animation: none;
  }
}
</style>
