<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import type { ManagedProcess, Workspace } from '@dev-dashboard/contracts';

import {
  ApiRequestError,
  cleanupManagedProcesses,
  fetchManagedProcesses,
  fetchProjects,
  fetchWorkspaces,
  type ProcessesQuery,
} from '../api';
import {
  formatDuration,
  kindLabel,
  processDetailPath,
  processDurationReference,
  processStatusLabel,
  processStatusToneClass,
} from '../utils/process-format';
import { RequestGeneration } from '../utils/request-generation';

interface ProjectOption { id: string; name: string; workspaceId?: string }

const workspaces = ref<Workspace[]>([]);
const projects = ref<ProjectOption[]>([]);
const items = ref<ManagedProcess[]>([]);

const workspaceFilter = ref('');
const projectFilter = ref('');
const kindFilter = ref<'' | 'server' | 'test'>('');

const loading = ref(false);
const referenceErrorMessage = ref('');
const processesErrorMessage = ref('');
const cleanupMessage = ref('');
const cleanupRunning = ref(false);
const now = ref(Date.now());

const generation = new RequestGeneration();
let controller: AbortController | undefined;
let clockInterval: ReturnType<typeof setInterval> | undefined;

const eligibleProjects = computed(() =>
  workspaceFilter.value
    ? projects.value.filter((project) => project.workspaceId === workspaceFilter.value)
    : projects.value,
);

const hasItems = computed(() => items.value.length > 0);

const projectNameById = computed(() => {
  const map = new Map<string, string>();
  for (const project of projects.value) map.set(project.id, project.name);
  return map;
});

async function loadReferenceData(): Promise<void> {
  try {
    const [loadedWorkspaces, loadedProjects] = await Promise.all([fetchWorkspaces(), fetchProjects()]);
    workspaces.value = loadedWorkspaces;
    projects.value = loadedProjects.map((project) => ({
      id: project.id,
      name: project.name,
      ...(project.workspaceId ? { workspaceId: project.workspaceId } : {}),
    }));
    referenceErrorMessage.value = '';
  } catch (error) {
    referenceErrorMessage.value = error instanceof ApiRequestError
      ? error.message
      : 'Não foi possível carregar workspaces e projetos.';
  }
}

async function loadProcesses(): Promise<void> {
  controller?.abort();
  controller = new AbortController();
  const token = generation.invalidate();
  loading.value = true;
  processesErrorMessage.value = '';

  const query: ProcessesQuery = { signal: controller.signal };
  if (workspaceFilter.value) query.workspaceId = workspaceFilter.value;
  if (projectFilter.value) query.projectId = projectFilter.value;
  if (kindFilter.value) query.kind = kindFilter.value;

  try {
    const result = await fetchManagedProcesses(query);
    if (!generation.isCurrent(token)) return;
    items.value = result;
  } catch (error) {
    if (controller?.signal.aborted) return;
    if (!generation.isCurrent(token)) return;
    processesErrorMessage.value = error instanceof ApiRequestError
      ? error.message
      : 'Não foi possível carregar os processos gerenciados.';
    items.value = [];
  } finally {
    if (generation.isCurrent(token)) loading.value = false;
  }
}

async function runCleanup(): Promise<void> {
  if (cleanupRunning.value) return;
  const confirmed = typeof window === 'undefined' || window.confirm(
    'Remover registros de estados terminais (parado ou falho) que já ultrapassaram a janela de retenção configurada? Processos em execução e estados terminais recentes não são afetados.',
  );
  if (!confirmed) return;
  cleanupRunning.value = true;
  cleanupMessage.value = '';
  try {
    const removed = await cleanupManagedProcesses();
    cleanupMessage.value = removed === 0
      ? 'Nenhum estado obsoleto foi encontrado.'
      : `Removidos ${removed} registro${removed === 1 ? '' : 's'} obsoleto${removed === 1 ? '' : 's'}.`;
    await loadProcesses();
  } catch (error) {
    cleanupMessage.value = error instanceof ApiRequestError
      ? error.message
      : 'Não foi possível concluir a limpeza.';
  } finally {
    cleanupRunning.value = false;
  }
}

watch(workspaceFilter, () => {
  if (projectFilter.value) {
    const stillEligible = eligibleProjects.value.some((project) => project.id === projectFilter.value);
    if (!stillEligible) projectFilter.value = '';
  }
  void loadProcesses();
});

watch([projectFilter, kindFilter], () => {
  void loadProcesses();
});

onMounted(async () => {
  await loadReferenceData();
  await loadProcesses();
  clockInterval = setInterval(() => { now.value = Date.now(); }, 1000);
});

onBeforeUnmount(() => {
  controller?.abort();
  if (clockInterval) clearInterval(clockInterval);
});
</script>

<template>
  <section id="processes" class="content">
    <div class="section-heading">
      <div>
        <span class="section-kicker">Ambiente local</span>
        <h2>Processos gerenciados</h2>
        <p class="section-description">
          Servidores e execuções de testes iniciados pelo dashboard. A limpeza remove apenas
          registros de estados terminais (parado ou falho) que já ultrapassaram a janela de
          retenção configurada — nada em execução é interrompido, e estados terminais recentes
          continuam visíveis até vencerem a retenção.
        </p>
      </div>
      <button type="button" class="processes-cleanup-button" :disabled="cleanupRunning" @click="runCleanup">
        {{ cleanupRunning ? 'Limpando…' : 'Limpar estados obsoletos' }}
      </button>
    </div>

    <p v-if="cleanupMessage" class="activity-empty" style="min-height: auto; padding: 12px" aria-live="polite">
      {{ cleanupMessage }}
    </p>

    <div class="activity-filters" role="group" aria-label="Filtros de processos gerenciados">
      <label>
        <span>Workspace</span>
        <select v-model="workspaceFilter">
          <option value="">Todos</option>
          <option v-for="workspace in workspaces" :key="workspace.id" :value="workspace.id">{{ workspace.name }}</option>
        </select>
      </label>

      <label>
        <span>Projeto</span>
        <select v-model="projectFilter">
          <option value="">Todos</option>
          <option v-for="project in eligibleProjects" :key="project.id" :value="project.id">{{ project.name }}</option>
        </select>
      </label>

      <label>
        <span>Tipo</span>
        <select v-model="kindFilter">
          <option value="">Todos</option>
          <option value="server">Servidor</option>
          <option value="test">Testes</option>
        </select>
      </label>
    </div>

    <p v-if="referenceErrorMessage" class="activity-error" role="alert">{{ referenceErrorMessage }}</p>
    <p v-if="processesErrorMessage" class="activity-error" role="alert">{{ processesErrorMessage }}</p>

    <div v-if="loading && !hasItems" class="activity-empty" aria-live="polite">Carregando processos…</div>

    <div v-else-if="!hasItems && !processesErrorMessage && !referenceErrorMessage" class="activity-empty">
      Nenhum processo gerenciado no momento.
    </div>

    <ol v-else class="activity-list" aria-label="Processos gerenciados">
      <li v-for="process in items" :key="process.id" class="activity-item">
        <div class="activity-item-main">
          <div class="activity-item-heading">
            <RouterLink :to="processDetailPath(process)" class="activity-item-title">
              {{ projectNameById.get(process.projectId) ?? process.projectId }}
            </RouterLink>
            <span class="activity-item-origin">{{ kindLabel(process.kind) }}</span>
          </div>
          <div class="activity-item-meta">
            <span class="activity-status" :class="processStatusToneClass(process.status)">
              {{ processStatusLabel(process.status) }}
            </span>
            <span v-if="process.pid">PID {{ process.pid }}</span>
            <span v-if="process.port">porta {{ process.port }}</span>
            <span>duração {{ formatDuration(process.startedAt, processDurationReference(process, now)) }}</span>
          </div>
        </div>
      </li>
    </ol>
  </section>
</template>
