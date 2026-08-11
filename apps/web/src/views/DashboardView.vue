<script setup lang="ts">
import { computed } from 'vue';
import {
  ArrowPathIcon,
  PlayIcon,
  StopIcon,
  TrashIcon,
} from '@heroicons/vue/24/outline';

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

const sortedProjects = computed(() => sortProjectsByPriority(projects.value));
const visibleRecentProjectIds = computed(() =>
  recentProjectIds(projects.value),
);

const projectsWithServer = computed(() =>
  sortedProjects.value.filter(
    (project) => project.capabilities.includes('server') && project.enabled,
  ),
);

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

            <div
              v-if="projectsWithServer.length > 0"
              class="repository-server-actions"
              role="group"
              aria-label="Controles dos servidores"
            >
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
            </div>
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
        </div>
      </template>

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

      <ul v-else class="projects-list">
        <ProjectCard
          v-for="project in sortedProjects"
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

.repository-server-actions,
.compact-actions {
  display: flex;
  align-items: center;
  gap: 7px;
}

.repository-server-actions {
  margin-left: 3px;
}

.compact-actions {
  justify-content: flex-end;
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

.compact-action-button-busy svg {
  animation: compact-action-spin 800ms linear infinite;
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
}

@media (prefers-reduced-motion: reduce) {
  .compact-action-button-busy svg {
    animation: none;
  }
}
</style>
