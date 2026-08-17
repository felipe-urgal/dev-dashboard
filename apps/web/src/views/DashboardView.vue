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
  warningCount,
  processSummary,
  loadingProcessSummary,
  processSummaryError,
  loadProcessSummary,
  enabledUpdatingIds,
  rescanSelectedWorkspace,
  toggleProjectEnabled,
} = dashboardStore;

const sortedProjects = computed(() => sortProjectsByPriority(projects.value));

const overviewMetrics = computed(() => [
  {
    key: 'projects',
    label: 'Projetos',
    value: projects.value.length,
    detail: 'detectados',
  },
  {
    key: 'active',
    label: 'Ativos',
    value: projects.value.filter((project) => project.enabled).length,
    detail: 'disponíveis',
  },
  {
    key: 'git',
    label: 'Git',
    value: projects.value.filter((project) =>
      project.capabilities.includes('git'),
    ).length,
    detail: 'com integração',
  },
  {
    key: 'servers',
    label: 'Servidores',
    value: projects.value.filter((project) =>
      project.capabilities.includes('server'),
    ).length,
    detail: 'com suporte',
  },
  {
    key: 'running',
    label: 'Em execução',
    value: processSummary.value.active,
    detail: 'processos ativos',
  },
  {
    key: 'failed',
    label: 'Falhas',
    value: processSummary.value.failed,
    detail: 'processos com erro',
  },
]);
</script>

<template>
  <section
    id="overview"
    class="content"
    :aria-busy="loadingProjects"
    aria-labelledby="overview-title"
  >
    <Card
      class="overview-summary-card"
      aria-labelledby="overview-summary-title"
    >
      <template #header>
        <div class="overview-summary-heading">
          <h2 id="overview-summary-title" class="section-kicker">
            Resumo do workspace
          </h2>
          <code v-if="lastScannedPath" class="overview-summary-path">
            {{ lastScannedPath }}
          </code>
          <span
            v-if="loadingProcessSummary"
            class="overview-summary-status"
            role="status"
          >
            Atualizando processos…
          </span>
          <span
            v-else-if="processSummaryError"
            class="overview-summary-status overview-summary-status-error"
            role="status"
          >
            {{ processSummaryError }}
          </span>
        </div>
      </template>

      <div class="overview-summary-grid">
        <div
          v-for="metric in overviewMetrics"
          :key="metric.key"
          :data-key="metric.key"
          class="overview-summary-metric"
        >
          <span>{{ metric.label }}</span>
          <strong>{{ metric.value }}</strong>
          <small>{{ metric.detail }}</small>
        </div>
        <div
          v-if="warningCount > 0"
          data-key="warnings"
          class="overview-summary-metric overview-summary-metric-warning"
        >
          <span>Atenções</span>
          <strong>{{ warningCount }}</strong>
          <small>encontradas no último scan</small>
        </div>
      </div>
    </Card>

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
.overview-summary-card {
  margin-bottom: 14px;
}

.overview-summary-heading {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.overview-summary-path {
  overflow: hidden;
  max-width: 100%;
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.overview-summary-action {
  color: var(--accent);
  font-size: 12px;
  font-weight: 700;
  text-decoration: none;
}

.overview-summary-action:hover {
  text-decoration: underline;
}

.overview-summary-action:focus-visible {
  border-radius: 4px;
  outline: 2px solid var(--accent);
  outline-offset: 3px;
}

.overview-summary-status {
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 600;
}

.overview-summary-status-error {
  color: var(--danger-text);
}

.overview-summary-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.overview-summary-metric {
  display: grid;
  min-height: 86px;
  align-content: center;
  gap: 4px;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 13px 14px;
  background: var(--surface-2);
}

.overview-summary-metric span,
.overview-summary-metric small {
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 600;
}

.overview-summary-metric strong {
  color: var(--text);
  font-size: 24px;
  line-height: 1;
}

.overview-summary-metric-warning {
  border-color: color-mix(in srgb, var(--warning-text) 45%, var(--border));
  background: var(--warning-surface);
}

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
  .overview-summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .compact-actions {
    width: 100%;
    justify-content: flex-start;
    flex-wrap: wrap;
  }
}

@media (max-width: 420px) {
  .overview-summary-grid {
    grid-template-columns: 1fr;
  }
}

@media (prefers-reduced-motion: reduce) {
  .compact-action-button-busy svg {
    animation: none;
  }
}
</style>
