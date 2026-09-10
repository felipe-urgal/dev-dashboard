<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { RouteLocationRaw } from 'vue-router';
import {
  AdjustmentsHorizontalIcon,
  ArrowPathIcon,
  ChartBarIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  CubeIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
  PlayIcon,
  Squares2X2Icon,
  StopIcon,
} from '@heroicons/vue/24/outline';

import type {
  AttentionItem,
  WorkspaceAttention,
} from '@dev-dashboard/contracts';

import { fetchWorkspaceAttention } from '../api';
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
  processSummary,
  enabledUpdatingIds,
  errorMessage,
  ensureDashboardLoaded,
  rescanSelectedWorkspace,
  toggleProjectEnabled,
} = dashboardStore;

const attention = ref<WorkspaceAttention | null>(null);
const loadingAttention = ref(false);
const attentionError = ref('');
const projectQuery = ref('');
const reverseProjectOrder = ref(false);
const manualRefreshing = ref(false);
const lastUpdated = ref<Date | null>(null);

let attentionRequestId = 0;
let attentionWorkspaceId: string | null = null;
let attentionWasScanning = false;

const sortedProjects = computed(() => sortProjectsByPriority(projects.value));

const filteredProjects = computed(() => {
  const query = projectQuery.value.trim().toLocaleLowerCase('pt-BR');
  let items = [...sortedProjects.value];

  if (query) {
    items = items.filter((project) =>
      `${project.name} ${project.path}`.toLocaleLowerCase('pt-BR').includes(query),
    );
  }

  if (reverseProjectOrder.value) items.reverse();
  return items;
});

const workspaceTitle = computed(() => {
  const name = selectedWorkspace.value?.name ?? 'Projetos pessoais';
  return name === 'Projetos Pessoais' ? 'Projetos pessoais' : name;
});

const workspaceName = computed(
  () => selectedWorkspace.value?.name ?? 'Projetos Pessoais',
);

const criticalCount = computed(
  () =>
    attention.value?.items.filter((item) => item.severity === 'critical').length ??
    0,
);

const attentionItems = computed(() => attention.value?.items.slice(0, 2) ?? []);

const runningCount = computed(() =>
  Math.min(processSummary.value.active, sortedProjects.value.length),
);

const stoppedCount = computed(() =>
  Math.max(sortedProjects.value.length - runningCount.value, 0),
);

const isRefreshing = computed(
  () => manualRefreshing.value || scanningWorkspace.value || loadingAttention.value,
);

const lastUpdatedLabel = computed(() =>
  lastUpdated.value ? 'agora mesmo' : 'aguardando atualização',
);

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
      lastUpdated.value = new Date();
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

async function refreshWorkspace(): Promise<void> {
  if (isRefreshing.value) return;

  manualRefreshing.value = true;
  try {
    await rescanSelectedWorkspace();
    await loadAttention();
    lastUpdated.value = new Date();
  } finally {
    manualRefreshing.value = false;
  }
}

watch(
  [selectedWorkspaceId, scanningWorkspace],
  ([workspaceId, scanning]) => {
    const workspaceChanged = workspaceId !== attentionWorkspaceId;
    const scanFinished = attentionWasScanning && !scanning;

    attentionWorkspaceId = workspaceId;
    attentionWasScanning = scanning;

    if (!workspaceId || scanning) return;
    if (workspaceChanged || scanFinished) void loadAttention();
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
    class="content dashboard-mission-control"
    :aria-busy="loadingProjects || isRefreshing"
    aria-labelledby="overview-title"
  >
    <header class="dashboard-header">
      <div class="dashboard-title-block">
        <p class="dashboard-greeting">Bom dia! 👋</p>
        <h1 id="overview-title">{{ workspaceTitle }}</h1>
        <p class="dashboard-summary">
          <span>{{ sortedProjects.length }} projetos</span>
          <span aria-hidden="true">·</span>
          <span>{{ runningCount }} rodando</span>
          <span aria-hidden="true">·</span>
          <strong>{{ criticalCount }} alertas críticos</strong>
        </p>
      </div>

      <div class="dashboard-refresh-block">
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
        <span class="dashboard-last-updated">
          Última atualização: {{ lastUpdatedLabel }}
        </span>
      </div>
    </header>

    <div class="dashboard-layout">
      <main class="dashboard-primary">
        <div class="dashboard-toolbar" aria-label="Navegação dos projetos">
          <div class="dashboard-tabs">
            <span class="dashboard-tab dashboard-tab-active" aria-current="page">
              <Squares2X2Icon aria-hidden="true" />
              Projetos
            </span>
            <RouterLink class="dashboard-tab" :to="{ name: 'processes' }">
              <ChartBarIcon aria-hidden="true" />
              Visão operacional
            </RouterLink>
          </div>

          <div class="dashboard-search-actions">
            <label class="dashboard-search">
              <MagnifyingGlassIcon aria-hidden="true" />
              <span class="sr-only">Buscar projetos</span>
              <input
                v-model="projectQuery"
                type="search"
                placeholder="Buscar projetos..."
                autocomplete="off"
              />
            </label>
            <button
              type="button"
              class="dashboard-filter-button"
              :aria-pressed="reverseProjectOrder"
              :title="
                reverseProjectOrder
                  ? 'Restaurar ordem dos projetos'
                  : 'Inverter ordem dos projetos'
              "
              :aria-label="
                reverseProjectOrder
                  ? 'Restaurar ordem dos projetos'
                  : 'Inverter ordem dos projetos'
              "
              @click="reverseProjectOrder = !reverseProjectOrder"
            >
              <AdjustmentsHorizontalIcon aria-hidden="true" />
            </button>
          </div>
        </div>

        <div class="dashboard-projects-heading">
          <h2>Todos os projetos ({{ filteredProjects.length }})</h2>
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

        <div v-else-if="filteredProjects.length === 0" class="dashboard-no-results">
          <strong>Nenhum projeto encontrado</strong>
          <span>Tente outro nome ou caminho.</span>
        </div>

        <ul v-else class="dashboard-project-list">
          <ProjectCard
            v-for="project in filteredProjects"
            :key="project.id"
            :project="project"
            :enabled-updating="enabledUpdatingIds.includes(project.id)"
            @toggle-enabled="toggleProjectEnabled"
          />
        </ul>
      </main>

      <aside class="dashboard-rail" aria-label="Resumo do workspace">
        <section class="dashboard-rail-card workspace-status-card">
          <h2>Status do workspace</h2>

          <div class="workspace-identity">
            <span class="workspace-online-dot" aria-hidden="true" />
            <div>
              <strong>{{ workspaceName }}</strong>
              <span>Ambiente local</span>
            </div>
          </div>

          <div class="workspace-metrics">
            <div class="workspace-metric workspace-metric-projects">
              <span class="workspace-metric-icon"><CubeIcon aria-hidden="true" /></span>
              <div>
                <strong>{{ sortedProjects.length }}</strong>
                <span>Projetos</span>
              </div>
            </div>

            <div class="workspace-metric workspace-metric-running">
              <span class="workspace-metric-icon"><PlayIcon aria-hidden="true" /></span>
              <div>
                <strong>{{ runningCount }}</strong>
                <span>Rodando</span>
              </div>
            </div>

            <div class="workspace-metric workspace-metric-stopped">
              <span class="workspace-metric-icon"><StopIcon aria-hidden="true" /></span>
              <div>
                <strong>{{ stoppedCount }}</strong>
                <span>Parados</span>
              </div>
            </div>

            <div class="workspace-metric workspace-metric-critical">
              <span class="workspace-metric-icon">
                <ExclamationTriangleIcon aria-hidden="true" />
              </span>
              <div>
                <strong>{{ criticalCount }}</strong>
                <span>Críticos</span>
              </div>
            </div>
          </div>
        </section>

        <section class="dashboard-rail-card attention-card">
          <header class="attention-card-header">
            <span class="attention-card-icon" aria-hidden="true">
              <ExclamationTriangleIcon />
            </span>
            <div>
              <h2>Atenção agora</h2>
              <p>
                {{ criticalCount }} problema{{ criticalCount === 1 ? '' : 's' }}
                crítico{{ criticalCount === 1 ? '' : 's' }} precisam de atenção.
              </p>
            </div>
          </header>

          <LoadingSkeleton
            v-if="loadingAttention && !attention"
            label="Verificando alertas…"
            :rows="2"
          />

          <div v-else-if="attentionError" class="attention-card-feedback" role="alert">
            <span>Não foi possível atualizar os alertas.</span>
            <button type="button" @click="loadAttention">Tentar novamente</button>
          </div>

          <div v-else-if="!selectedWorkspaceId" class="attention-card-feedback">
            Selecione um workspace para verificar os alertas.
          </div>

          <div v-else-if="attentionItems.length === 0" class="attention-card-healthy">
            <CheckCircleIcon aria-hidden="true" />
            <span>Nenhum problema crítico agora.</span>
          </div>

          <ul v-else class="attention-card-list" aria-live="polite">
            <li v-for="item in attentionItems" :key="item.id">
              <RouterLink class="attention-card-item" :to="attentionRoute(item)">
                <div class="attention-card-item-content">
                  <div class="attention-card-item-meta">
                    <strong>{{ item.projectName }}</strong>
                    <span>{{ categoryLabel(item) }}</span>
                    <span class="attention-card-severity">
                      {{ item.severity === 'critical' ? 'Crítico' : 'Atenção' }}
                    </span>
                  </div>
                  <p>{{ item.message }}</p>
                </div>
                <ChevronRightIcon aria-hidden="true" />
              </RouterLink>
            </li>
          </ul>
        </section>

        <section class="dashboard-rail-card workspace-calm-card">
          <div class="workspace-calm-content">
            <span class="workspace-calm-icon" aria-hidden="true">
              <CheckCircleIcon />
            </span>
            <div>
              <h2>Tudo sob controle</h2>
              <p>Monitore seus projetos, processos e implantações em um só lugar.</p>
            </div>
          </div>

          <svg
            class="workspace-calm-wave"
            viewBox="0 0 420 96"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path
              d="M0,70 C52,40 81,82 126,63 C173,43 186,19 225,39 C264,60 284,77 317,56 C348,36 373,8 420,36 L420,96 L0,96 Z"
            />
            <path
              d="M0,82 C56,67 88,48 132,72 C176,95 211,86 251,63 C293,38 335,57 420,19"
            />
          </svg>
        </section>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.dashboard-mission-control {
  width: 100%;
  min-height: 100vh;
  padding: 34px 24px 38px;
  background: var(--surface-0);
}

.dashboard-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 28px;
  margin: 0 0 28px;
}

.dashboard-greeting {
  margin: 0 0 5px;
  color: var(--text-muted);
  font-size: 15px;
  font-weight: 600;
}

.dashboard-title-block h1 {
  margin: 0;
  color: var(--text);
  font-size: clamp(34px, 3vw, 43px);
  font-weight: 750;
  line-height: 1.08;
  letter-spacing: -0.045em;
}

.dashboard-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 9px 0 0;
  color: var(--text-muted);
  font-size: 16px;
}

.dashboard-summary strong {
  color: var(--danger-text);
  font-weight: 650;
}

.dashboard-refresh-block {
  display: grid;
  justify-items: end;
  gap: 8px;
  flex: 0 0 auto;
  padding-top: 2px;
}

.dashboard-refresh-button {
  display: inline-flex;
  min-height: 50px;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 0 20px;
  border: 1px solid var(--accent);
  border-radius: 10px;
  color: var(--text);
  background: color-mix(in srgb, var(--accent-soft) 54%, var(--surface-1));
  font: inherit;
  font-size: 14px;
  font-weight: 650;
  cursor: pointer;
  transition:
    border-color 160ms ease,
    background 160ms ease,
    transform 160ms ease;
}

.dashboard-refresh-button:hover:not(:disabled) {
  border-color: #58a6ff;
  background: var(--accent-soft);
  transform: translateY(-1px);
}

.dashboard-refresh-button:disabled {
  cursor: wait;
  opacity: 0.62;
}

.dashboard-refresh-button svg {
  width: 20px;
  height: 20px;
  color: var(--info-text);
}

.dashboard-refresh-button.is-busy svg {
  animation: dashboard-spin 800ms linear infinite;
}

.dashboard-last-updated {
  color: var(--text-muted);
  font-size: 12px;
}

.dashboard-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 400px;
  align-items: start;
  gap: 28px;
}

.dashboard-primary,
.dashboard-rail {
  min-width: 0;
}

.dashboard-toolbar {
  display: flex;
  min-height: 70px;
  align-items: stretch;
  justify-content: space-between;
  gap: 18px;
  padding: 0 14px 0 8px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: color-mix(in srgb, var(--surface-1) 90%, transparent);
}

.dashboard-tabs {
  display: flex;
  align-items: stretch;
  gap: 8px;
}

.dashboard-tab {
  position: relative;
  display: inline-flex;
  min-width: 156px;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 0 14px;
  color: var(--text-muted);
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
}

.dashboard-tab::after {
  position: absolute;
  right: 10px;
  bottom: -1px;
  left: 10px;
  height: 3px;
  border-radius: 3px 3px 0 0;
  background: transparent;
  content: '';
}

.dashboard-tab svg {
  width: 22px;
  height: 22px;
}

.dashboard-tab:hover,
.dashboard-tab:focus-visible {
  color: var(--text);
}

.dashboard-tab-active {
  color: var(--text);
}

.dashboard-tab-active svg {
  color: var(--accent);
}

.dashboard-tab-active::after {
  background: var(--accent);
}

.dashboard-search-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-left: auto;
}

.dashboard-search {
  display: flex;
  width: min(290px, 28vw);
  min-height: 46px;
  align-items: center;
  gap: 10px;
  padding: 0 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--text-muted);
  background: var(--surface-1);
}

.dashboard-search:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent);
}

.dashboard-search svg {
  width: 21px;
  height: 21px;
  flex: 0 0 auto;
}

.dashboard-search input {
  min-width: 0;
  width: 100%;
  border: 0;
  outline: 0;
  color: var(--text);
  background: transparent;
  font: inherit;
  font-size: 14px;
}

.dashboard-search input::placeholder {
  color: var(--text-muted);
}

.dashboard-filter-button {
  display: inline-grid;
  width: 46px;
  height: 46px;
  place-items: center;
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--text-muted);
  background: var(--surface-1);
  cursor: pointer;
}

.dashboard-filter-button:hover,
.dashboard-filter-button:focus-visible,
.dashboard-filter-button[aria-pressed='true'] {
  border-color: var(--border-strong);
  color: var(--text);
  background: var(--surface-2);
}

.dashboard-filter-button svg {
  width: 20px;
  height: 20px;
}

.dashboard-projects-heading {
  margin: 20px 0 12px;
}

.dashboard-projects-heading h2 {
  margin: 0;
  color: var(--text);
  font-size: 16px;
  font-weight: 700;
}

.dashboard-project-list {
  display: grid;
  gap: 14px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.dashboard-projects-loading,
.dashboard-panel-state,
.dashboard-no-results {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface-1);
}

.dashboard-no-results {
  display: grid;
  justify-items: center;
  gap: 4px;
  padding: 44px 20px;
  color: var(--text-muted);
}

.dashboard-no-results strong {
  color: var(--text);
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

.dashboard-rail {
  display: grid;
  gap: 18px;
}

.dashboard-rail-card {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: color-mix(in srgb, var(--surface-1) 94%, transparent);
  box-shadow: 0 1px 0 rgb(255 255 255 / 2%) inset;
}

.workspace-status-card {
  padding: 20px;
}

.dashboard-rail-card h2 {
  margin: 0;
  color: var(--text);
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.workspace-identity {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 16px 0 18px;
}

.workspace-online-dot {
  width: 46px;
  height: 46px;
  flex: 0 0 auto;
  border-radius: 50%;
  background:
    radial-gradient(circle at center, var(--success-text) 0 7px, transparent 8px),
    var(--success-surface);
}

.workspace-identity div,
.workspace-metric div {
  display: grid;
  gap: 2px;
}

.workspace-identity strong {
  color: var(--text);
  font-size: 14px;
}

.workspace-identity span,
.workspace-metric span {
  color: var(--text-muted);
  font-size: 12px;
}

.workspace-metrics {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.workspace-metric {
  display: flex;
  min-height: 80px;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-1);
}

.workspace-metric-icon {
  display: grid;
  width: 44px;
  height: 44px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 10px;
}

.workspace-metric-icon svg {
  width: 24px;
  height: 24px;
}

.workspace-metric strong {
  color: var(--text);
  font-size: 20px;
  line-height: 1;
}

.workspace-metric-projects .workspace-metric-icon {
  color: #58a6ff;
  background: var(--accent-soft);
}

.workspace-metric-running .workspace-metric-icon {
  color: var(--success-text);
  background: var(--success-surface);
}

.workspace-metric-stopped .workspace-metric-icon {
  color: var(--text-muted);
  background: var(--surface-3);
}

.workspace-metric-critical {
  border-color: color-mix(in srgb, var(--danger-text) 42%, var(--border));
  background: color-mix(in srgb, var(--danger-surface) 62%, var(--surface-1));
}

.workspace-metric-critical .workspace-metric-icon {
  color: var(--danger-text);
  background: var(--danger-surface);
}

.workspace-metric-critical strong {
  color: var(--danger-text);
}

.attention-card {
  padding: 20px;
}

.attention-card-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 16px;
}

.attention-card-header p {
  margin: 5px 0 0;
  color: var(--text-muted);
  font-size: 12px;
}

.attention-card-icon {
  display: grid;
  width: 42px;
  height: 42px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 10px;
  color: var(--danger-text);
  background: var(--danger-surface);
}

.attention-card-icon svg {
  width: 25px;
  height: 25px;
}

.attention-card-list {
  display: grid;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.attention-card-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 20px;
  align-items: center;
  gap: 10px;
  min-height: 106px;
  padding: 13px 12px 13px 16px;
  border: 1px solid color-mix(in srgb, var(--danger-text) 38%, var(--border));
  border-left: 3px solid var(--danger-text);
  border-radius: 10px;
  color: inherit;
  background: color-mix(in srgb, var(--danger-surface) 58%, var(--surface-1));
  text-decoration: none;
  transition:
    border-color 160ms ease,
    background 160ms ease;
}

.attention-card-item:hover,
.attention-card-item:focus-visible {
  border-color: var(--danger-text);
  background: color-mix(in srgb, var(--danger-surface) 76%, var(--surface-1));
}

.attention-card-item > svg {
  width: 19px;
  height: 19px;
  color: var(--text);
}

.attention-card-item-meta {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
}

.attention-card-item-meta strong {
  color: var(--text);
  font-size: 13px;
}

.attention-card-item-meta > span {
  display: inline-flex;
  min-height: 24px;
  align-items: center;
  padding: 3px 8px;
  border-radius: 999px;
  color: var(--text-muted);
  background: var(--surface-3);
  font-size: 11px;
}

.attention-card-item-meta .attention-card-severity {
  border: 1px solid color-mix(in srgb, var(--danger-text) 54%, transparent);
  color: var(--danger-text);
  background: var(--danger-surface);
}

.attention-card-item p {
  margin: 8px 0 0;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.45;
}

.attention-card-feedback,
.attention-card-healthy {
  display: flex;
  align-items: center;
  gap: 9px;
  min-height: 76px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--text-muted);
  background: var(--surface-1);
  font-size: 12px;
}

.attention-card-feedback {
  justify-content: space-between;
}

.attention-card-feedback button {
  border: 0;
  color: var(--info-text);
  background: transparent;
  font: inherit;
  font-weight: 650;
  cursor: pointer;
}

.attention-card-healthy svg {
  width: 21px;
  height: 21px;
  color: var(--success-text);
}

.workspace-calm-card {
  position: relative;
  min-height: 190px;
  overflow: hidden;
  padding: 21px;
}

.workspace-calm-content {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: flex-start;
  gap: 13px;
}

.workspace-calm-icon {
  display: grid;
  width: 48px;
  height: 48px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 50%;
  color: var(--success-text);
  background: var(--success-surface);
}

.workspace-calm-icon svg {
  width: 26px;
  height: 26px;
}

.workspace-calm-content p {
  max-width: 27ch;
  margin: 6px 0 0;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.45;
}

.workspace-calm-wave {
  position: absolute;
  z-index: 1;
  right: 0;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 92px;
  color: var(--text-dim);
  opacity: 0.22;
}

.workspace-calm-wave path:first-child {
  fill: var(--surface-3);
  stroke: none;
}

.workspace-calm-wave path:last-child {
  fill: none;
  stroke: var(--text-muted);
  stroke-width: 1.2;
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

@media (max-width: 1280px) {
  .dashboard-layout {
    grid-template-columns: minmax(0, 1fr) 340px;
    gap: 20px;
  }

  .dashboard-toolbar {
    align-items: center;
  }

  .dashboard-tab {
    min-width: auto;
  }

  .dashboard-search {
    width: 230px;
  }
}

@media (max-width: 1080px) {
  .dashboard-layout {
    grid-template-columns: 1fr;
  }

  .dashboard-rail {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .workspace-calm-card {
    grid-column: 1 / -1;
  }
}

@media (max-width: 760px) {
  .dashboard-mission-control {
    padding: 22px 14px 28px;
  }

  .dashboard-header,
  .dashboard-toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .dashboard-refresh-block {
    justify-items: stretch;
  }

  .dashboard-refresh-button {
    width: 100%;
  }

  .dashboard-last-updated {
    text-align: right;
  }

  .dashboard-toolbar {
    padding: 0;
  }

  .dashboard-tabs {
    min-height: 58px;
  }

  .dashboard-tab {
    flex: 1;
  }

  .dashboard-search-actions {
    width: 100%;
    margin: 0;
    padding: 0 10px 10px;
  }

  .dashboard-search {
    width: 100%;
  }

  .dashboard-rail {
    grid-template-columns: 1fr;
  }

  .workspace-calm-card {
    grid-column: auto;
  }
}

@media (prefers-reduced-motion: reduce) {
  .dashboard-refresh-button.is-busy svg {
    animation: none;
  }
}
</style>
