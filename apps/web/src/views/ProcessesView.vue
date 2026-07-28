<script setup lang="ts">
import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  TrashIcon,
} from '@heroicons/vue/24/outline';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import type {
  ManagedProcess,
  ManagedProcessStatus,
  Workspace,
} from '@dev-dashboard/contracts';

import {
  ApiRequestError,
  cleanupManagedProcesses,
  fetchManagedProcesses,
  fetchProjects,
  fetchWorkspaces,
  type ProcessesQuery,
} from '../api';
import StatusBadge from '../components/StatusBadge.vue';
import { useAutoDismiss } from '../composables/useAutoDismiss';
import {
  formatDuration,
  kindLabel,
  processDetailPath,
  processDurationReference,
  processStatusLabel,
} from '../utils/process-format';
import { RequestGeneration } from '../utils/request-generation';
import { processToneFor } from '../utils/status-tones';

interface ProjectOption {
  id: string;
  name: string;
  workspaceId?: string;
}

type ProcessStatusFilter =
  '' | 'active' | 'stopped' | 'failed';

const ACTIVE_STATUSES = new Set<ManagedProcessStatus>([
  'starting',
  'running',
  'stopping',
]);

const TERMINAL_STATUSES = new Set<ManagedProcessStatus>([
  'stopped',
  'failed',
]);

const workspaces = ref<Workspace[]>([]);
const projects = ref<ProjectOption[]>([]);
const items = ref<ManagedProcess[]>([]);

const workspaceFilter = ref('');
const projectFilter = ref('');
const kindFilter = ref<'' | 'server' | 'test'>('');
const statusFilter = ref<ProcessStatusFilter>('');

const loading = ref(false);
const referenceErrorMessage = ref('');
const processesErrorMessage = ref('');
const cleanupMessage = ref('');
const cleanupFailed = ref(false);
const cleanupRunning = ref(false);
const now = ref(Date.now());

useAutoDismiss(referenceErrorMessage, '');
useAutoDismiss(processesErrorMessage, '');
useAutoDismiss(cleanupMessage, '');

const generation = new RequestGeneration();
let controller: AbortController | undefined;
let clockInterval: ReturnType<typeof setInterval> | undefined;

function isActiveStatus(status: ManagedProcessStatus): boolean {
  return ACTIVE_STATUSES.has(status);
}

function isTerminalStatus(status: ManagedProcessStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

function matchesStatusFilter(process: ManagedProcess): boolean {
  if (!statusFilter.value) return true;
  if (statusFilter.value === 'active') {
    return isActiveStatus(process.status);
  }
  return process.status === statusFilter.value;
}

function processOrder(process: ManagedProcess): number {
  if (isActiveStatus(process.status)) return 0;
  if (process.status === 'stopped') return 1;
  return 2;
}

const eligibleProjects = computed(() =>
  workspaceFilter.value
    ? projects.value.filter(
      (project) =>
        project.workspaceId === workspaceFilter.value,
    )
    : projects.value,
);

const visibleItems = computed(() =>
  [...items.value]
    .filter(matchesStatusFilter)
    .sort((left, right) => {
      const statusDifference =
        processOrder(left) - processOrder(right);
      if (statusDifference !== 0) return statusDifference;

      const leftStartedAt = left.startedAt
        ? new Date(left.startedAt).getTime()
        : 0;
      const rightStartedAt = right.startedAt
        ? new Date(right.startedAt).getTime()
        : 0;
      return rightStartedAt - leftStartedAt;
    }),
);

const hasVisibleItems = computed(
  () => visibleItems.value.length > 0,
);

const activeCount = computed(
  () =>
    items.value.filter((process) =>
      isActiveStatus(process.status),
    ).length,
);

const stoppedCount = computed(
  () =>
    items.value.filter(
      (process) => process.status === 'stopped',
    ).length,
);

const failedCount = computed(
  () =>
    items.value.filter(
      (process) => process.status === 'failed',
    ).length,
);

const terminalCount = computed(
  () =>
    items.value.filter((process) =>
      isTerminalStatus(process.status),
    ).length,
);

const projectNameById = computed(() => {
  const map = new Map<string, string>();
  for (const project of projects.value) {
    map.set(project.id, project.name);
  }
  return map;
});

const projectWorkspaceById = computed(() => {
  const map = new Map<string, string>();
  for (const project of projects.value) {
    if (project.workspaceId) {
      map.set(project.id, project.workspaceId);
    }
  }
  return map;
});

const workspaceNameById = computed(() => {
  const map = new Map<string, string>();
  for (const workspace of workspaces.value) {
    map.set(workspace.id, workspace.name);
  }
  return map;
});

function workspaceNameFor(process: ManagedProcess): string {
  const workspaceId =
    process.workspaceId ??
    projectWorkspaceById.value.get(process.projectId);
  if (!workspaceId) return '—';
  return workspaceNameById.value.get(workspaceId) ?? workspaceId;
}

async function loadReferenceData(): Promise<void> {
  try {
    const [loadedWorkspaces, loadedProjects] =
      await Promise.all([
        fetchWorkspaces(),
        fetchProjects(),
      ]);
    workspaces.value = loadedWorkspaces;
    projects.value = loadedProjects.map((project) => ({
      id: project.id,
      name: project.name,
      ...(project.workspaceId
        ? { workspaceId: project.workspaceId }
        : {}),
    }));
    referenceErrorMessage.value = '';
  } catch (error) {
    referenceErrorMessage.value =
      error instanceof ApiRequestError
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

  const query: ProcessesQuery = {
    signal: controller.signal,
  };
  if (workspaceFilter.value) {
    query.workspaceId = workspaceFilter.value;
  }
  if (projectFilter.value) {
    query.projectId = projectFilter.value;
  }
  if (kindFilter.value) query.kind = kindFilter.value;

  try {
    const result = await fetchManagedProcesses(query);
    if (!generation.isCurrent(token)) return;
    items.value = result;
  } catch (error) {
    if (controller?.signal.aborted) return;
    if (!generation.isCurrent(token)) return;
    processesErrorMessage.value =
      error instanceof ApiRequestError
        ? error.message
        : 'Não foi possível carregar os processos gerenciados.';
    items.value = [];
  } finally {
    if (generation.isCurrent(token)) {
      loading.value = false;
    }
  }
}

async function runCleanup(): Promise<void> {
  if (cleanupRunning.value || terminalCount.value === 0) {
    return;
  }

  const total = terminalCount.value;
  const confirmed =
    typeof window === 'undefined' ||
    window.confirm(
      `Remover ${total} processo${total === 1 ? '' : 's'} finalizado${total === 1 ? '' : 's'} e seus logs? Processos em execução serão preservados.`,
    );
  if (!confirmed) return;

  cleanupRunning.value = true;
  cleanupMessage.value = '';
  cleanupFailed.value = false;

  try {
    const removed = await cleanupManagedProcesses();
    await loadProcesses();
    cleanupMessage.value =
      removed === 0
        ? 'Nenhum processo finalizado foi encontrado.'
        : `${removed} processo${removed === 1 ? '' : 's'} finalizado${removed === 1 ? '' : 's'} removido${removed === 1 ? '' : 's'}. Processos em execução foram preservados.`;
  } catch (error) {
    cleanupFailed.value = true;
    cleanupMessage.value =
      error instanceof ApiRequestError
        ? error.message
        : 'Não foi possível concluir a limpeza.';
  } finally {
    cleanupRunning.value = false;
  }
}

watch(workspaceFilter, () => {
  if (projectFilter.value) {
    const stillEligible = eligibleProjects.value.some(
      (project) => project.id === projectFilter.value,
    );
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
  clockInterval = setInterval(() => {
    now.value = Date.now();
  }, 1000);
});

onBeforeUnmount(() => {
  controller?.abort();
  if (clockInterval) clearInterval(clockInterval);
});
</script>

<template>
  <section
    id="processes"
    class="content processes-page"
    :aria-busy="loading"
  >
    <div class="processes-heading">
      <div>
        <span class="section-kicker">Ambiente local</span>
        <h2>Processos gerenciados</h2>
        <p class="section-description">
          Acompanhe servidores e testes iniciados pelo dashboard.
          Limpar finalizados remove estados parados ou com falha e
          preserva tudo o que ainda está em execução.
        </p>
      </div>

      <div class="processes-cleanup">
        <button
          type="button"
          class="processes-cleanup-button"
          :disabled="cleanupRunning || terminalCount === 0"
          aria-describedby="processes-cleanup-help"
          @click="runCleanup"
        >
          <TrashIcon aria-hidden="true" />
          {{ cleanupRunning ? 'Limpando…' : 'Limpar finalizados' }}
        </button>
        <span id="processes-cleanup-help">
          Processos em execução serão preservados.
        </span>
      </div>
    </div>

    <dl
      class="processes-summary"
      aria-label="Resumo dos processos"
    >
      <div>
        <dt>
          <span
            class="processes-summary-dot processes-summary-dot-active"
            aria-hidden="true"
          />
          Em execução
        </dt>
        <dd>{{ activeCount }}</dd>
      </div>
      <div>
        <dt>
          <span
            class="processes-summary-dot processes-summary-dot-stopped"
            aria-hidden="true"
          />
          Parado
        </dt>
        <dd>{{ stoppedCount }}</dd>
      </div>
      <div>
        <dt>
          <span
            class="processes-summary-dot processes-summary-dot-failed"
            aria-hidden="true"
          />
          Falhou
        </dt>
        <dd>{{ failedCount }}</dd>
      </div>
      <div>
        <dt>Total</dt>
        <dd>{{ items.length }}</dd>
      </div>
    </dl>

    <p
      v-if="cleanupMessage"
      class="processes-feedback"
      :class="{
        'processes-feedback-error': cleanupFailed,
        'processes-feedback-success': !cleanupFailed,
      }"
      :role="cleanupFailed ? 'alert' : 'status'"
    >
      {{ cleanupMessage }}
    </p>

    <div
      class="processes-filters"
      role="group"
      aria-label="Filtros de processos gerenciados"
    >
      <label>
        <span>Workspace</span>
        <select v-model="workspaceFilter">
          <option value="">Todos</option>
          <option
            v-for="workspace in workspaces"
            :key="workspace.id"
            :value="workspace.id"
          >
            {{ workspace.name }}
          </option>
        </select>
      </label>

      <label>
        <span>Projeto</span>
        <select v-model="projectFilter">
          <option value="">Todos</option>
          <option
            v-for="project in eligibleProjects"
            :key="project.id"
            :value="project.id"
          >
            {{ project.name }}
          </option>
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

      <label>
        <span>Estado</span>
        <select v-model="statusFilter">
          <option value="">Todos</option>
          <option value="active">Em execução</option>
          <option value="stopped">Parado</option>
          <option value="failed">Falhou</option>
        </select>
      </label>

      <div class="processes-refresh-control">
        <span>Atualização</span>
        <button
          type="button"
          class="processes-refresh-button"
          :disabled="loading"
          @click="loadProcesses"
        >
          <ArrowPathIcon
            aria-hidden="true"
            :class="{ 'processes-refresh-icon-active': loading }"
          />
          {{ loading ? 'Atualizando…' : 'Atualizar' }}
        </button>
      </div>
    </div>

    <p
      v-if="referenceErrorMessage"
      class="activity-error"
      role="alert"
    >
      {{ referenceErrorMessage }}
    </p>
    <p
      v-if="processesErrorMessage"
      class="activity-error"
      role="alert"
    >
      {{ processesErrorMessage }}
    </p>

    <div
      v-if="loading && items.length === 0"
      class="activity-empty"
      aria-live="polite"
    >
      Carregando processos…
    </div>

    <div
      v-else-if="
        !hasVisibleItems &&
        !processesErrorMessage &&
        !referenceErrorMessage
      "
      class="activity-empty"
    >
      {{
        items.length === 0
          ? 'Nenhum processo gerenciado no momento.'
          : 'Nenhum processo corresponde aos filtros escolhidos.'
      }}
    </div>

    <div v-else class="processes-table-shell">
      <table class="processes-table">
        <thead>
          <tr>
            <th scope="col">Processo</th>
            <th scope="col">Workspace</th>
            <th scope="col">Tipo</th>
            <th scope="col">Identificação</th>
            <th scope="col">Duração</th>
            <th scope="col">Estado</th>
            <th scope="col">
              <span class="sr-only">Ações</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="process in visibleItems"
            :key="process.id"
          >
            <td data-label="Processo">
              <RouterLink
                :to="processDetailPath(process)"
                class="processes-table-title"
              >
                {{
                  projectNameById.get(process.projectId) ??
                  process.projectId
                }}
              </RouterLink>
              <small>{{ process.id }}</small>
            </td>
            <td data-label="Workspace">
              {{ workspaceNameFor(process) }}
            </td>
            <td data-label="Tipo">
              <span class="processes-kind-badge">
                {{ kindLabel(process.kind) }}
              </span>
            </td>
            <td data-label="Identificação">
              <span v-if="process.port">
                porta {{ process.port }}
              </span>
              <span v-else-if="process.pid">
                PID {{ process.pid }}
              </span>
              <span v-else>—</span>
            </td>
            <td data-label="Duração">
              {{
                formatDuration(
                  process.startedAt,
                  processDurationReference(process, now),
                )
              }}
            </td>
            <td data-label="Estado">
              <StatusBadge
                :tone="processToneFor(process.status)"
              >
                {{ processStatusLabel(process.status) }}
              </StatusBadge>
            </td>
            <td class="processes-table-action">
              <RouterLink
                :to="processDetailPath(process)"
                class="processes-open-button"
                :aria-label="`Abrir detalhes de ${
                  projectNameById.get(process.projectId) ??
                  process.projectId
                }`"
              >
                <ArrowTopRightOnSquareIcon aria-hidden="true" />
              </RouterLink>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
