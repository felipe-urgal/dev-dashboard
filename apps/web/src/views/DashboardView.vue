<script setup lang="ts">
import { computed } from 'vue';
import { ArrowPathIcon } from '@heroicons/vue/24/outline';

import Card from '../components/Card.vue';
import LoadingSkeleton from '../components/LoadingSkeleton.vue';
import ProjectCard from '../components/ProjectCard.vue';
import { dashboardStore } from '../stores/dashboard';
import { sortProjectsByPriority } from '../utils/project-priority';

const {
  projects,
  loadingProjects,
  scanningWorkspace,
  lastScannedPath,
  enabledUpdatingIds,
  rescanSelectedWorkspace,
  toggleProjectEnabled,
} = dashboardStore;

const sortedProjects = computed(() => sortProjectsByPriority(projects.value));
</script>

<template>
  <section
    id="overview"
    class="content"
    :aria-busy="loadingProjects"
    aria-labelledby="overview-title"
  >
    <Card id="repositories" class="repositories-section">
      <template #header>
        <h2 id="overview-title" class="section-kicker">Repositórios</h2>
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
              <span>Atualizar</span>
            </button>
          </template>
        </div>
      </template>

      <LoadingSkeleton
        v-if="loadingProjects"
        label="Carregando projetos…"
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
          :enabled-updating="enabledUpdatingIds.includes(project.id)"
          @toggle-enabled="toggleProjectEnabled"
        />
      </ul>
    </Card>
  </section>
</template>

<style scoped>
.compact-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 7px;
}

.compact-action-button {
  display: inline-flex;
  min-height: 34px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-muted);
  background: var(--surface-2);
  cursor: pointer;
  gap: 12px;
  padding: 8px;
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
