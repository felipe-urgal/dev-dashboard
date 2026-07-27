<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import type { Activity, ActivityList, ActivityOrigin, ActivityStatus, Workspace } from '@dev-dashboard/contracts';

import {
  ApiRequestError,
  fetchActivities,
  fetchProjects,
  fetchWorkspaces,
  type ActivityQuery,
} from '../api';
import {
  activityDetailPath,
  formatInstant,
  originLabel,
  statusLabel,
} from '../utils/activity-format';
import { activityToneFor } from '../utils/status-tones';
import StatusBadge from '../components/StatusBadge.vue';
import { RequestGeneration } from '../utils/request-generation';

interface ProjectOption { id: string; name: string; workspaceId?: string }

const workspaces = ref<Workspace[]>([]);
const projects = ref<ProjectOption[]>([]);
const items = ref<Activity[]>([]);
const page = ref(1);
const pageSize = ref(20);
const total = ref(0);
const totalPages = ref(0);

const workspaceFilter = ref('');
const projectFilter = ref('');
const originFilter = ref<'' | ActivityOrigin>('');
const statusFilter = ref<'' | ActivityStatus>('');

const loading = ref(false);
const referenceErrorMessage = ref('');
const activityErrorMessage = ref('');

const generation = new RequestGeneration();
let controller: AbortController | undefined;

const eligibleProjects = computed(() =>
  workspaceFilter.value
    ? projects.value.filter((project) => project.workspaceId === workspaceFilter.value)
    : projects.value,
);

const hasItems = computed(() => items.value.length > 0);

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

async function loadActivities(): Promise<void> {
  controller?.abort();
  controller = new AbortController();
  const token = generation.invalidate();
  loading.value = true;
  activityErrorMessage.value = '';

  const query: ActivityQuery = { page: page.value, pageSize: pageSize.value, signal: controller.signal };
  if (workspaceFilter.value) query.workspaceId = workspaceFilter.value;
  if (projectFilter.value) query.projectId = projectFilter.value;
  if (originFilter.value) query.origin = originFilter.value;
  if (statusFilter.value) query.status = statusFilter.value;

  try {
    const result: ActivityList = await fetchActivities(query);
    if (!generation.isCurrent(token)) return;
    items.value = result.items;
    total.value = result.total;
    totalPages.value = result.totalPages;
    page.value = result.page;
    pageSize.value = result.pageSize;
  } catch (error) {
    if (controller?.signal.aborted) return;
    if (!generation.isCurrent(token)) return;
    activityErrorMessage.value = error instanceof ApiRequestError
      ? error.message
      : 'Não foi possível carregar as atividades.';
    items.value = [];
    total.value = 0;
    totalPages.value = 0;
  } finally {
    if (generation.isCurrent(token)) loading.value = false;
  }
}

function resetToFirstPage(): void {
  page.value = 1;
  void loadActivities();
}

function goToPage(next: number): void {
  if (next < 1 || (totalPages.value > 0 && next > totalPages.value)) return;
  page.value = next;
  void loadActivities();
}

watch(workspaceFilter, () => {
  if (projectFilter.value) {
    const stillEligible = eligibleProjects.value.some((project) => project.id === projectFilter.value);
    if (!stillEligible) projectFilter.value = '';
  }
  resetToFirstPage();
});

watch([projectFilter, originFilter, statusFilter], () => {
  resetToFirstPage();
});

onMounted(async () => {
  await loadReferenceData();
  await loadActivities();
});

onBeforeUnmount(() => {
  controller?.abort();
});
</script>

<template>
  <section id="activity" class="content">
    <div class="section-heading">
      <div>
        <span class="section-kicker">Ambiente local</span>
        <h2>Painel de atividade</h2>
        <p class="section-description">
          Visão somente leitura das execuções de catálogo, testes e servidores. A retenção
          varia por origem: o catálogo tem histórico persistente; testes e servidores refletem
          o estado gerenciado atual, sem histórico próprio.
        </p>
      </div>
    </div>

    <div class="activity-filters" role="group" aria-label="Filtros do painel de atividade">
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
        <span>Origem</span>
        <select v-model="originFilter">
          <option value="">Todas</option>
          <option value="script">Catálogo</option>
          <option value="test">Testes</option>
          <option value="server">Servidor</option>
        </select>
      </label>

      <label>
        <span>Estado</span>
        <select v-model="statusFilter">
          <option value="">Todos</option>
          <option value="running">Em execução</option>
          <option value="succeeded">Concluída</option>
          <option value="failed">Falhou</option>
          <option value="cancelled">Cancelada</option>
          <option value="unknown">Desconhecida</option>
        </select>
      </label>
    </div>

    <p v-if="referenceErrorMessage" class="activity-error" role="alert">{{ referenceErrorMessage }}</p>
    <p v-if="activityErrorMessage" class="activity-error" role="alert">{{ activityErrorMessage }}</p>

    <div v-if="loading && !hasItems" class="activity-empty" aria-live="polite">Carregando atividades…</div>

    <div v-else-if="!hasItems && !activityErrorMessage && !referenceErrorMessage" class="activity-empty">
      Nenhuma atividade encontrada para os filtros escolhidos.
    </div>

    <ol v-else class="activity-list" aria-label="Atividades recentes">
      <li v-for="activity in items" :key="activity.id" class="activity-item">
        <div class="activity-item-main">
          <div class="activity-item-heading">
            <RouterLink :to="activityDetailPath(activity)" class="activity-item-title">
              {{ activity.label }}
            </RouterLink>
            <span class="activity-item-origin">{{ originLabel(activity.origin) }}</span>
          </div>
          <div class="activity-item-meta">
            <StatusBadge :tone="activityToneFor(activity.status)">{{ statusLabel(activity.status) }}</StatusBadge>
            <span>Início: {{ formatInstant(activity.startedAt) }}</span>
            <span v-if="activity.finishedAt">Fim: {{ formatInstant(activity.finishedAt) }}</span>
          </div>
        </div>
      </li>
    </ol>

    <nav v-if="totalPages > 1" class="activity-pagination" aria-label="Paginação de atividades">
      <button type="button" :disabled="page <= 1 || loading" @click="goToPage(page - 1)">Anterior</button>
      <span>Página {{ page }} de {{ totalPages }} — {{ total }} atividades</span>
      <button type="button" :disabled="page >= totalPages || loading" @click="goToPage(page + 1)">Próxima</button>
    </nav>
  </section>
</template>
