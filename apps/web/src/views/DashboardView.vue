<script setup lang="ts">
import UiButton from '../components/ui/UiButton.vue';
import { computed, inject, onMounted, onBeforeUnmount, ref, watch } from 'vue';
import { ArrowPathIcon, PlayIcon, StopIcon } from '@heroicons/vue/24/outline';

import EmptyState from '../components/EmptyState.vue';
import LoadingSkeleton from '../components/LoadingSkeleton.vue';
import ProjectCard from '../components/ProjectCard.vue';
import { startProjectProcess, stopProjectProcess } from '../api';
import { confirmDialog } from '../stores/app-dialog';
import { dashboardStore } from '../stores/dashboard';
import { sortProjectsByName } from '../utils/project-priority';

const {
  projects,
  loadingProjects,
  scanningWorkspace,
  selectedWorkspaceId,
  selectedWorkspace,
  enabledUpdatingIds,
  errorMessage,
  scanWarnings,
  scanStatus,
  workspaces,
  managedProcesses,
  getCardProcess,
  loadProcessSummary,
  ensureDashboardLoaded,
  rescanSelectedWorkspace,
  toggleProjectEnabled,
} = dashboardStore;

const openWorkspaceManager = inject<() => void>(
  'openWorkspaceManager',
  () => undefined,
);

const manualRefreshing = ref(false);
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
let disposed = false;
let schedulerVersion = 0;

function stopScheduler(): void {
  schedulerVersion += 1;
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = undefined;
}

function visible(): boolean {
  return (
    typeof document === 'undefined' || document.visibilityState === 'visible'
  );
}

function scheduleProcesses(): void {
  stopScheduler();
  if (disposed || !visible() || !selectedWorkspaceId.value) return;
  const version = schedulerVersion;
  const transitioning = managedProcesses.value.some(
    (process) => process.status === 'starting' || process.status === 'stopping',
  );
  refreshTimer = setTimeout(
    async () => {
      if (version !== schedulerVersion || disposed || !visible()) return;
      await loadProcessSummary();
      if (version === schedulerVersion) scheduleProcesses();
    },
    transitioning ? 2_000 : 15_000,
  );
}

function handleVisibility(): void {
  if (visible()) {
    void loadProcessSummary().then(scheduleProcesses);
  } else stopScheduler();
}

watch(selectedWorkspaceId, () => {
  // A troca já faz a leitura no store; apenas reinicia o scheduler.
  scheduleProcesses();
});

onMounted(() => {
  document.addEventListener('visibilitychange', handleVisibility);
  scheduleProcesses();
});
onBeforeUnmount(() => {
  disposed = true;
  stopScheduler();
  document.removeEventListener('visibilitychange', handleVisibility);
});

const sortedProjects = computed(() => sortProjectsByName(projects.value));

const workspaceTitle = computed(() => {
  const name = selectedWorkspace.value?.name ?? 'Projetos pessoais';
  return name === 'Projetos Pessoais' ? 'Projetos pessoais' : name;
});

const runningCount = computed(
  () =>
    managedProcesses.value.filter(
      (process) =>
        process.kind === 'server' &&
        (process.status === 'running' || process.status === 'starting'),
    ).length,
);

const summary = computed(() => {
  const total = sortedProjects.value.length;
  const noun = total === 1 ? 'projeto' : 'projetos';
  return `${total} ${noun} · ${runningCount.value === 0 ? 'nenhum rodando' : `${runningCount.value} rodando`}`;
});

const serverProjects = computed(() =>
  sortedProjects.value.filter(
    (project) => project.enabled && project.capabilities.includes('server'),
  ),
);

function isServerActive(projectId: string): boolean {
  const status = getCardProcess(projectId)?.status;
  return status === 'running' || status === 'starting';
}

const idleProjects = computed(() =>
  serverProjects.value.filter((project) => !isServerActive(project.id)),
);
const activeProjects = computed(() =>
  serverProjects.value.filter((project) => isServerActive(project.id)),
);

const bulkBusy = ref(false);
const bulkError = ref('');

// Sequencial de propósito: o backend aloca portas e não deve receber
// várias inicializações concorrentes do mesmo workspace.
async function runBulk(
  targets: typeof serverProjects.value,
  action: (projectId: string) => Promise<unknown>,
  failureLabel: string,
): Promise<void> {
  bulkBusy.value = true;
  bulkError.value = '';
  stopScheduler();
  const failed: string[] = [];
  for (const project of targets) {
    try {
      await action(project.id);
    } catch {
      failed.push(project.name);
    }
  }
  if (failed.length > 0) {
    bulkError.value = `${failureLabel}: ${failed.join(', ')}.`;
  }
  try {
    await loadProcessSummary();
  } finally {
    bulkBusy.value = false;
    scheduleProcesses();
  }
}

function startAll(): Promise<void> {
  return runBulk(
    idleProjects.value,
    startProjectProcess,
    'Não foi possível iniciar',
  );
}

async function stopAll(): Promise<void> {
  const targets = activeProjects.value;
  const confirmed = await confirmDialog({
    title: 'Parar todos os servidores?',
    message: `${targets.length} servidores em execução serão parados.`,
    confirmLabel: 'Parar todos',
    tone: 'warning',
  });
  if (!confirmed) return;
  await runBulk(targets, stopProjectProcess, 'Não foi possível parar');
}

const isRefreshing = computed(
  () => manualRefreshing.value || scanningWorkspace.value,
);

async function refreshWorkspace(): Promise<void> {
  if (isRefreshing.value) return;

  manualRefreshing.value = true;
  try {
    stopScheduler();
    await rescanSelectedWorkspace();
  } finally {
    manualRefreshing.value = false;
    scheduleProcesses();
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
      <div>
        <h1 id="overview-title">{{ workspaceTitle }}</h1>
        <p class="dashboard-summary">{{ summary }}</p>
      </div>

      <div class="dashboard-header-actions">
        <UiButton
          v-if="idleProjects.length >= 2"
          :disabled="bulkBusy"
          @click="startAll"
          size="lg"
        >
          <PlayIcon aria-hidden="true" />
          <span>Iniciar todos</span>
        </UiButton>
        <UiButton
          v-if="activeProjects.length >= 2"
          :disabled="bulkBusy"
          @click="stopAll"
          size="lg"
        >
          <StopIcon aria-hidden="true" />
          <span>Parar todos ({{ activeProjects.length }})</span>
        </UiButton>
        <UiButton
          :busy="isRefreshing"
          :disabled="isRefreshing || !selectedWorkspaceId"
          @click="refreshWorkspace"
          size="lg"
        >
          <ArrowPathIcon v-if="!isRefreshing" aria-hidden="true" />
          <span>Atualizar</span>
        </UiButton>
      </div>
    </header>

    <p v-if="bulkError" class="dashboard-bulk-error" role="alert">
      {{ bulkError }}
    </p>

    <main class="dashboard-primary" aria-label="Navegação dos projetos">
      <h2 id="projects-title" class="sr-only">Projetos</h2>

      <div
        v-if="scanStatus === 'warnings' && scanWarnings.length"
        class="dashboard-scan-warning"
        role="status"
      >
        Descoberta parcial: {{ scanWarnings.length }} aviso(s) no scan do
        workspace.
        <details>
          <summary>Ver avisos</summary>
          <ul>
            <li v-for="(warning, index) in scanWarnings" :key="index">
              {{ warning.path }}: {{ warning.message }}
            </li>
          </ul>
        </details>
      </div>
      <div class="dashboard-project-columns" aria-hidden="true">
        <span>Projeto</span>
        <span>Branch</span>
        <span>Status</span>
        <span class="dashboard-column-actions">Ações</span>
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
          <UiButton @click="ensureDashboardLoaded"> Tentar novamente </UiButton>
        </template>
      </EmptyState>

      <EmptyState
        v-else-if="sortedProjects.length === 0 && workspaces.length === 0"
        class="dashboard-panel-state"
        icon="◇"
        title="Nenhum workspace cadastrado"
        description="Adicione uma pasta para detectar automaticamente aplicações Rails e Node."
      >
        <template #actions>
          <UiButton @click="openWorkspaceManager">
            Adicionar workspace
          </UiButton>
        </template>
      </EmptyState>

      <EmptyState
        v-else-if="sortedProjects.length === 0"
        class="dashboard-panel-state"
        icon="◇"
        title="Nenhum projeto neste workspace"
        :description="`Nenhum app Rails ou Node foi encontrado em ${selectedWorkspace?.path ?? 'este workspace'}.`"
      >
        <template #actions>
          <UiButton :disabled="isRefreshing" @click="refreshWorkspace">
            Atualizar workspace
          </UiButton>
        </template>
      </EmptyState>

      <ul
        v-else
        class="dashboard-project-list"
        aria-labelledby="projects-title"
      >
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
  --overview-columns: minmax(220px, 340px) minmax(180px, 300px)
    minmax(170px, 240px) minmax(150px, 1fr);
  width: 100%;
  padding: 40px var(--page-gutter) 48px;
  background: var(--surface-0);
}

.dashboard-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 28px;
}

.dashboard-header h1 {
  margin: 0;
  color: var(--text);
  font-size: clamp(30px, 3vw, 36px);
  font-weight: 750;
  line-height: 1.1;
  letter-spacing: -0.04em;
}

.dashboard-header-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.dashboard-bulk-error {
  margin: -12px 0 20px;
  padding: 10px 14px;
  border: 1px solid color-mix(in srgb, var(--danger-text) 45%, transparent);
  border-radius: 8px;
  color: var(--danger-text);
  background: var(--danger-surface);
  font-size: 13px;
}

.dashboard-summary {
  margin: 8px 0 0;
  color: var(--text-muted);
  font-size: 14px;
}

.dashboard-scan-warning {
  margin-bottom: 14px;
  padding: 10px 14px;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  color: var(--text-muted);
  background: var(--surface-2);
  font-size: 13px;
}

.dashboard-scan-warning summary {
  cursor: pointer;
}

.dashboard-primary {
  min-width: 0;
}

.dashboard-project-columns {
  display: grid;
  grid-template-columns: var(--overview-columns);
  gap: 16px;
  padding: 0 20px 10px;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 650;
}

.dashboard-column-actions {
  text-align: right;
}

.dashboard-project-list {
  margin: 0;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--surface-1);
  list-style: none;
}

.dashboard-projects-loading,
.dashboard-panel-state {
  margin-top: 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-1);
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

@media (max-width: 760px) {
  .dashboard-mission-control {
    padding: 24px 14px 28px;
  }

  .dashboard-header {
    align-items: stretch;
    flex-direction: column;
    gap: 16px;
    margin-bottom: 20px;
  }

  .dashboard-project-columns {
    display: none;
  }
}
</style>
