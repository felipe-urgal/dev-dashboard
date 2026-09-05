<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { RouteLocationRaw } from 'vue-router';
import {
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from '@heroicons/vue/24/outline';

import type { AttentionItem, WorkspaceAttention } from '@dev-dashboard/contracts';

import { fetchWorkspaceAttention } from '../api';
import Card from '../components/Card.vue';
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
  lastScannedPath,
  enabledUpdatingIds,
  errorMessage,
  ensureDashboardLoaded,
  rescanSelectedWorkspace,
  toggleProjectEnabled,
} = dashboardStore;

const sortedProjects = computed(() => sortProjectsByPriority(projects.value));
const attention = ref<WorkspaceAttention | null>(null);
const loadingAttention = ref(false);
const attentionError = ref('');
let attentionRequestId = 0;

async function loadAttention(): Promise<void> {
  const workspaceId = selectedWorkspaceId.value;
  const requestId = ++attentionRequestId;

  if (!workspaceId) {
    attention.value = null;
    attentionError.value = '';
    loadingAttention.value = false;
    return;
  }

  loadingAttention.value = true;
  attentionError.value = '';

  try {
    const result = await fetchWorkspaceAttention(workspaceId);
    if (
      requestId === attentionRequestId &&
      workspaceId === selectedWorkspaceId.value
    ) {
      attention.value = result;
    }
  } catch (error) {
    if (requestId === attentionRequestId) {
      attention.value = null;
      attentionError.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível carregar a Central de Atenção.';
    }
  } finally {
    if (requestId === attentionRequestId) loadingAttention.value = false;
  }
}

watch(
  [selectedWorkspaceId, scanningWorkspace],
  ([workspaceId, scanning], [previousWorkspaceId, previousScanning]) => {
    if (!workspaceId || scanning) return;
    if (workspaceId !== previousWorkspaceId || previousScanning) {
      void loadAttention();
    }
  },
  { immediate: true },
);

function attentionRoute(item: AttentionItem): RouteLocationRaw {
  const projectId = item.action.projectId ?? item.projectId;

  switch (item.action.destination) {
    case 'processes':
      return { name: 'processes' };
    case 'git':
      return { name: 'project-git', params: { projectId } };
    case 'tests':
      return { name: 'project-tests', params: { projectId } };
    case 'production':
      return { name: 'project-production', params: { projectId } };
    case 'doctor':
      return { name: 'project-doctor', params: { projectId } };
  }
}

function categoryLabel(item: AttentionItem): string {
  switch (item.category) {
    case 'git':
      return 'Git';
    case 'process':
      return 'Processos';
    case 'test':
      return 'Testes';
    case 'production':
      return 'Produção';
    case 'doctor':
      return 'Doctor';
  }
}
</script>

<template>
  <section
    id="overview"
    class="content"
    :aria-busy="loadingProjects"
    aria-labelledby="overview-title"
  >
    <Card id="attention" class="attention-section">
      <template #header>
        <div class="attention-header">
          <div>
            <h2 class="section-kicker">Central de Atenção</h2>
            <p class="attention-description">O que precisa de ação agora.</p>
          </div>
          <span
            v-if="attention?.partial"
            class="attention-partial"
            title="Alguns sinais não puderam ser verificados nesta atualização."
          >
            Parcial
          </span>
        </div>
      </template>

      <template #actions>
        <button
          class="compact-action-button"
          :class="{ 'compact-action-button-busy': loadingAttention }"
          type="button"
          :disabled="loadingAttention || !selectedWorkspaceId"
          aria-label="Atualizar Central de Atenção"
          title="Atualizar Central de Atenção"
          @click="loadAttention"
        >
          <ArrowPathIcon aria-hidden="true" />
          <span>Atualizar</span>
        </button>
      </template>

      <LoadingSkeleton
        v-if="loadingAttention && !attention"
        label="Verificando sinais do workspace…"
        :rows="2"
      />

      <EmptyState
        v-else-if="attentionError"
        class="dashboard-error-state"
        role="alert"
        icon="!"
        title="Não foi possível verificar a atenção"
        :description="attentionError"
      >
        <template #actions>
          <button
            type="button"
            class="dashboard-retry-button"
            @click="loadAttention"
          >
            Tentar novamente
          </button>
        </template>
      </EmptyState>

      <EmptyState
        v-else-if="!selectedWorkspaceId"
        icon="◇"
        title="Selecione um workspace"
        description="A Central de Atenção usa os sinais dos projetos do workspace atual."
      />

      <div
        v-else-if="attention && attention.items.length === 0"
        class="attention-empty"
        role="status"
      >
        <CheckCircleIcon aria-hidden="true" />
        <div>
          <strong>Nada exige atenção agora</strong>
          <p>
            {{
              attention.partial
                ? 'Os sinais disponíveis estão saudáveis, mas parte da coleta ficou indisponível.'
                : 'Os sinais verificados do workspace estão saudáveis.'
            }}
          </p>
        </div>
      </div>

      <ul v-else-if="attention" class="attention-list" aria-live="polite">
        <li
          v-for="item in attention.items"
          :key="item.id"
          class="attention-item"
          :class="`attention-item-${item.severity}`"
        >
          <ExclamationTriangleIcon aria-hidden="true" />
          <div class="attention-item-content">
            <div class="attention-item-meta">
              <strong>{{ item.projectName }}</strong>
              <span>{{ categoryLabel(item) }}</span>
              <span
                class="attention-severity"
                :class="`attention-severity-${item.severity}`"
              >
                {{ item.severity === 'critical' ? 'Crítico' : 'Atenção' }}
              </span>
            </div>
            <p>{{ item.message }}</p>
          </div>
          <RouterLink class="attention-open" :to="attentionRoute(item)">
            Abrir
          </RouterLink>
        </li>
      </ul>
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
        v-if="loadingProjects && !errorMessage"
        label="Carregando projetos…"
        :rows="3"
      />

      <EmptyState
        v-else-if="errorMessage"
        class="dashboard-error-state"
        role="alert"
        icon="!"
        title="Não foi possível carregar os projetos"
        :description="errorMessage"
      >
        <template #actions>
          <button
            type="button"
            class="dashboard-retry-button"
            @click="ensureDashboardLoaded"
          >
            Tentar novamente
          </button>
        </template>
      </EmptyState>

      <EmptyState
        v-else-if="sortedProjects.length === 0"
        icon="◇"
        title="Nenhum projeto carregado"
        description="Cadastre ou selecione um workspace na barra lateral para detectar aplicações Rails e Node."
      />

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
.attention-section {
  margin-bottom: 16px;
}

.attention-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.attention-description,
.attention-empty p,
.attention-item p {
  margin: 3px 0 0;
  color: var(--text-muted);
}

.attention-description {
  font-size: 0.86rem;
}

.attention-partial,
.attention-severity {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 2px 7px;
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--text-muted);
  font-size: 0.72rem;
  font-weight: 700;
}

.attention-list {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.attention-item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--surface-2);
}

.attention-item > svg,
.attention-empty > svg {
  width: 20px;
  height: 20px;
  color: var(--text-muted);
}

.attention-item-critical > svg,
.attention-severity-critical {
  color: var(--danger-text);
}

.attention-item-content {
  min-width: 0;
}

.attention-item-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  color: var(--text-muted);
  font-size: 0.78rem;
}

.attention-item-meta strong {
  color: var(--text);
  font-size: 0.86rem;
}

.attention-item p {
  font-size: 0.88rem;
}

.attention-open {
  display: inline-flex;
  min-height: 32px;
  align-items: center;
  justify-content: center;
  padding: 6px 10px;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  color: var(--text);
  text-decoration: none;
  background: var(--surface-1);
  font-size: 0.8rem;
  font-weight: 700;
}

.attention-open:hover,
.attention-open:focus-visible {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.attention-empty {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 14px 2px;
}

.attention-empty > svg {
  color: var(--success-text, var(--text-muted));
}

.attention-empty strong {
  color: var(--text);
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

.dashboard-error-state :deep(p) {
  max-width: 56ch;
}

.dashboard-retry-button {
  min-height: 34px;
  padding: 8px 12px;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  color: var(--text);
  background: var(--surface-2);
  font: inherit;
  cursor: pointer;
}

.dashboard-retry-button:hover,
.dashboard-retry-button:focus-visible {
  border-color: var(--accent);
  background: var(--accent-soft);
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

  .attention-item {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .attention-open {
    grid-column: 2;
    justify-self: start;
  }
}

@media (prefers-reduced-motion: reduce) {
  .compact-action-button-busy svg {
    animation: none;
  }
}
</style>
