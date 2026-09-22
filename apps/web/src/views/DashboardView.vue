<script setup lang="ts">
import { computed, ref } from 'vue';
import { ArrowPathIcon } from '@heroicons/vue/24/outline';

import EmptyState from '../components/EmptyState.vue';
import LoadingSkeleton from '../components/LoadingSkeleton.vue';
import ProjectCard from '../components/ProjectCard.vue';
import { dashboardStore } from '../stores/dashboard';
import { sortProjectsByPriority } from '../utils/project-priority';

const {
  projects,
  loadingProjects,
  scanningWorkspace,
  selectedWorkspaceId,
  selectedWorkspace,
  enabledUpdatingIds,
  errorMessage,
  ensureDashboardLoaded,
  rescanSelectedWorkspace,
  toggleProjectEnabled,
} = dashboardStore;

const manualRefreshing = ref(false);

const sortedProjects = computed(() => sortProjectsByPriority(projects.value));

const workspaceTitle = computed(() => {
  const name = selectedWorkspace.value?.name ?? 'Projetos pessoais';
  return name === 'Projetos Pessoais' ? 'Projetos pessoais' : name;
});

const isRefreshing = computed(
  () => manualRefreshing.value || scanningWorkspace.value,
);

async function refreshWorkspace(): Promise<void> {
  if (isRefreshing.value) return;

  manualRefreshing.value = true;
  try {
    await rescanSelectedWorkspace();
  } finally {
    manualRefreshing.value = false;
  }
}
</script>

<template>
  <section
    id="overview"
    class="content dashboard-mission-control"
    :aria-busy="loadingProjects || isRefreshing"
    aria-labelledby="overview-title"
  >
    <header class="dashboard-header">
      <h1 id="overview-title">{{ workspaceTitle }}</h1>

      <button
        type="button"
        class="dashboard-refresh-button"
        :class="{ 'is-busy': isRefreshing }"
        :disabled="isRefreshing || !selectedWorkspaceId"
        @click="refreshWorkspace"
      >
        <ArrowPathIcon aria-hidden="true" />
        <span>Atualizar workspace</span>
      </button>
    </header>

    <main class="dashboard-primary">
      <h2 id="projects-title" class="sr-only">Projetos</h2>

      <div class="dashboard-project-columns" aria-hidden="true">
        <span>Projeto</span>
        <span>Status</span>
        <span>Ações</span>
      </div>

      <LoadingSkeleton
        v-if="loadingProjects && !errorMessage"
        class="dashboard-projects-loading"
        label="Carregando projetos…"
        :rows="4"
      />

      <EmptyState
        v-else-if="errorMessage"
        class="dashboard-panel-state"
        role="alert"
        icon="!"
        title="Não foi possível carregar os projetos"
        :description="errorMessage"
      >
        <template #actions>
          <button
            type="button"
            class="dashboard-secondary-button"
            @click="ensureDashboardLoaded"
          >
            Tentar novamente
          </button>
        </template>
      </EmptyState>

      <EmptyState
        v-else-if="sortedProjects.length === 0"
        class="dashboard-panel-state"
        icon="◇"
        title="Nenhum projeto carregado"
        description="Cadastre ou selecione um workspace na barra lateral para detectar aplicações Rails e Node."
      />

      <ul v-else class="dashboard-project-list" aria-labelledby="projects-title">
        <ProjectCard
          v-for="project in sortedProjects"
          :key="project.id"
          :project="project"
          :enabled-updating="enabledUpdatingIds.includes(project.id)"
          @toggle-enabled="toggleProjectEnabled"
        />
      </ul>
    </main>
  </section>
</template>

<style scoped>
.dashboard-mission-control {
  width: 100%;
  min-height: 100vh;
  padding: 42px 30px 40px;
  background: var(--surface-0);
}

.dashboard-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 38px;
}

.dashboard-header h1 {
  margin: 0;
  color: var(--text);
  font-size: clamp(34px, 3vw, 43px);
  font-weight: 750;
  line-height: 1.08;
  letter-spacing: -0.045em;
}

.dashboard-refresh-button {
  display: inline-flex;
  min-height: 46px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  gap: 9px;
  padding: 0 18px;
  border: 1px solid var(--accent);
  border-radius: 10px;
  color: var(--text);
  background: color-mix(in srgb, var(--accent-soft) 48%, var(--surface-1));
  font: inherit;
  font-size: 14px;
  font-weight: 650;
  cursor: pointer;
  transition:
    border-color 160ms ease,
    background 160ms ease;
}

.dashboard-refresh-button:hover:not(:disabled) {
  border-color: #58a6ff;
  background: var(--accent-soft);
}

.dashboard-refresh-button:disabled {
  cursor: wait;
  opacity: 0.62;
}

.dashboard-refresh-button svg {
  width: 19px;
  height: 19px;
  color: var(--info-text);
}

.dashboard-refresh-button.is-busy svg {
  animation: dashboard-spin 800ms linear infinite;
}

.dashboard-primary {
  min-width: 0;
}

.dashboard-project-columns {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) minmax(220px, 28%) 92px;
  gap: 14px;
  align-items: center;
  padding: 0 12px 12px;
  border-bottom: 1px solid var(--border);
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 650;
}

.dashboard-project-columns span:first-child {
  grid-column: 1 / 3;
}

.dashboard-project-columns span:nth-child(2) {
  grid-column: 3;
}

.dashboard-project-columns span:last-child {
  grid-column: 4;
  text-align: center;
}

.dashboard-project-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.dashboard-projects-loading,
.dashboard-panel-state {
  margin-top: 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-1);
}

.dashboard-secondary-button {
  min-height: 36px;
  padding: 8px 12px;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  color: var(--text);
  background: var(--surface-2);
  cursor: pointer;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@keyframes dashboard-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 760px) {
  .dashboard-mission-control {
    padding: 24px 14px 28px;
  }

  .dashboard-header {
    align-items: stretch;
    flex-direction: column;
    gap: 16px;
    margin-bottom: 26px;
  }

  .dashboard-refresh-button {
    width: 100%;
  }

  .dashboard-project-columns {
    grid-template-columns: 40px minmax(0, 1fr) auto;
    gap: 11px;
    padding-inline: 8px;
  }

  .dashboard-project-columns span:first-child {
    grid-column: 1 / 3;
  }

  .dashboard-project-columns span:nth-child(2),
  .dashboard-project-columns span:last-child {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .dashboard-refresh-button.is-busy svg {
    animation: none;
  }
}
</style>
