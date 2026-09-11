<script setup lang="ts">
import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  MagnifyingGlassIcon,
  TrashIcon,
} from '@heroicons/vue/24/outline';
import { computed, ref } from 'vue';

import ApiRequestDiagnostics from '../components/ApiRequestDiagnostics.vue';
import LoadingSkeleton from '../components/LoadingSkeleton.vue';
import ProcessesObservabilityOverview from '../components/ProcessesObservabilityOverview.vue';
import StatusBadge from '../components/StatusBadge.vue';
import { useProcessesView } from '../composables/useProcessesView';
import {
  formatDuration,
  kindLabel,
  processDetailPath,
  processDurationReference,
  processLogPath,
  processStatusLabel,
} from '../utils/process-format';
import { processToneFor } from '../utils/status-tones';

const {
  items,
  loading,
  referenceErrorMessage,
  processesErrorMessage,
  cleanupRunning,
  now,
  visibleItems,
  terminalCount,
  projectNameById,
  workspaceNameFor,
  workspaces,
  loadProcesses,
  reloadView,
  clearFilters,
  workspaceFilter,
  projectFilter,
  kindFilter,
  statusFilter,
  eligibleProjects,
  hasActiveFilters,
  activeCount,
  stoppedCount,
  failedCount,
  runCleanup,
} = useProcessesView();

const processQuery = ref('');
const diagnosticsDetails = ref<HTMLDetailsElement | null>(null);

const displayItems = computed(() => {
  const query = processQuery.value.trim().toLocaleLowerCase('pt-BR');
  if (!query) return visibleItems.value;

  return visibleItems.value.filter((process) => {
    const projectName =
      projectNameById.value.get(process.projectId) ?? process.projectId;
    const searchable = [
      projectName,
      process.id,
      process.kind,
      kindLabel(process.kind),
      process.status,
      processStatusLabel(process.status),
      workspaceNameFor(process),
      process.command ?? '',
      process.port ? String(process.port) : '',
      process.pid ? String(process.pid) : '',
    ]
      .join(' ')
      .toLocaleLowerCase('pt-BR');

    return searchable.includes(query);
  });
});

const hasDisplayItems = computed(() => displayItems.value.length > 0);
const hasAnyFilters = computed(
  () => hasActiveFilters.value || processQuery.value.trim().length > 0,
);

function clearAllFilters(): void {
  processQuery.value = '';
  clearFilters();
}

function openDiagnostics(): void {
  const details = diagnosticsDetails.value;
  if (!details) return;
  details.open = true;
  details.scrollIntoView({ block: 'start' });
}
</script>

<template>
  <section
    id="processes"
    class="content processes-page processes-observability-page"
    :aria-busy="loading"
    aria-labelledby="processes-title"
  >
    <header class="processes-observability-header">
      <div class="processes-observability-title-block">
        <span class="processes-observability-kicker">Processos</span>
        <h1 id="processes-title">Observabilidade</h1>
        <p>
          Acompanhe processos locais, atividade da API e saúde da sessão em um
          único lugar.
        </p>
      </div>

      <div
        class="processes-actions"
        role="group"
        aria-label="Ações de processos"
      >
        <button
          type="button"
          class="processes-refresh-button"
          title="Atualizar processos"
          :disabled="loading"
          @click="loadProcesses"
        >
          <ArrowPathIcon
            aria-hidden="true"
            :class="{ 'processes-refresh-icon-active': loading }"
          />
          {{ loading ? 'Atualizando…' : 'Atualizar' }}
        </button>
        <button
          type="button"
          class="processes-cleanup-button"
          :disabled="cleanupRunning || terminalCount === 0"
          aria-describedby="processes-cleanup-help"
          title="Limpar processos finalizados"
          @click="runCleanup"
        >
          <TrashIcon aria-hidden="true" />
          {{ cleanupRunning ? 'Limpando…' : 'Limpar finalizados' }}
        </button>
      </div>
    </header>

    <ProcessesObservabilityOverview
      :processes="items"
      :active-count="activeCount"
      :stopped-count="stoppedCount"
      :failed-count="failedCount"
      :project-name-by-id="projectNameById"
      :now="now"
      @open-diagnostics="openDiagnostics"
    />

    <div
      class="processes-filters processes-observability-filters"
      role="group"
      aria-label="Filtros de processos"
    >
      <label class="processes-search-control">
        <span>Buscar</span>
        <span class="processes-search-field">
          <MagnifyingGlassIcon aria-hidden="true" />
          <input
            id="process-filter-query"
            v-model="processQuery"
            type="search"
            placeholder="Projeto, processo, porta…"
            autocomplete="off"
          />
        </span>
      </label>

      <label>
        Workspace
        <select id="process-filter-workspace" v-model="workspaceFilter">
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
        Projeto
        <select id="process-filter-project" v-model="projectFilter">
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
        Tipo
        <select id="process-filter-kind" v-model="kindFilter">
          <option value="">Todos</option>
          <option value="server">Servidor</option>
          <option value="test">Testes</option>
          <option value="worker">Sidekiq</option>
          <option value="webpack">Webpack</option>
          <option value="compose-build">Docker build</option>
        </select>
      </label>
      <label>
        Estado
        <select id="process-filter-status" v-model="statusFilter">
          <option value="">Todos</option>
          <option value="active">Ativos</option>
          <option value="stopped">Finalizados</option>
          <option value="failed">Falhos</option>
        </select>
      </label>
      <button
        v-if="hasAnyFilters"
        type="button"
        class="processes-clear-button"
        @click="clearAllFilters"
      >
        Limpar
      </button>
    </div>

    <p id="processes-cleanup-help" class="sr-only">
      Remove apenas processos finalizados e seus logs. Processos em execução
      serão preservados.
    </p>

    <p v-if="referenceErrorMessage" class="activity-error" role="alert">
      {{ referenceErrorMessage }}
      <button type="button" class="processes-retry-button" @click="reloadView">
        Tentar novamente
      </button>
    </p>
    <p v-if="processesErrorMessage" class="activity-error" role="alert">
      {{ processesErrorMessage }}
      <button
        type="button"
        class="processes-retry-button"
        @click="loadProcesses"
      >
        Tentar novamente
      </button>
    </p>

    <p
      v-if="loading && items.length > 0"
      class="sr-only"
      role="status"
      aria-live="polite"
    >
      Atualizando processos…
    </p>

    <LoadingSkeleton
      v-if="loading && items.length === 0"
      label="Carregando processos…"
      :rows="4"
    />

    <div
      v-else-if="
        !hasDisplayItems && !processesErrorMessage && !referenceErrorMessage
      "
      class="activity-empty processes-observability-empty"
      role="status"
    >
      <span>
        {{
          items.length === 0
            ? 'Nenhum processo gerenciado no momento.'
            : 'Nenhum processo corresponde aos filtros escolhidos.'
        }}
      </span>
      <RouterLink
        v-if="items.length === 0"
        :to="{ name: 'dashboard' }"
        class="processes-empty-action"
      >
        Abrir repositórios
      </RouterLink>
    </div>

    <section
      v-else
      class="processes-list-section"
      aria-labelledby="process-list-title"
    >
      <header class="processes-list-header">
        <div>
          <span class="processes-observability-kicker">Execuções</span>
          <h2 id="process-list-title">Processos gerenciados</h2>
        </div>
        <span>{{ displayItems.length }} exibidos</span>
      </header>

      <div class="processes-card-grid">
        <article
          v-for="process in displayItems"
          :key="process.id"
          class="processes-process-card"
        >
          <header class="processes-process-card-header">
            <div>
              <RouterLink
                :to="processDetailPath(process)"
                class="processes-card-title"
              >
                {{
                  projectNameById.get(process.projectId) ?? process.projectId
                }}
              </RouterLink>
              <span>{{ workspaceNameFor(process) }}</span>
            </div>
            <StatusBadge :tone="processToneFor(process.status)">
              {{ processStatusLabel(process.status) }}
            </StatusBadge>
          </header>

          <dl class="processes-process-card-meta">
            <div>
              <dt>Tipo</dt>
              <dd>
                <span class="processes-kind-badge">
                  {{ kindLabel(process.kind) }}
                </span>
              </dd>
            </div>
            <div>
              <dt>Identificação</dt>
              <dd>
                <span v-if="process.port">porta {{ process.port }}</span>
                <span v-else-if="process.pid">PID {{ process.pid }}</span>
                <span v-else>—</span>
              </dd>
            </div>
            <div>
              <dt>Duração</dt>
              <dd>
                {{
                  formatDuration(
                    process.startedAt,
                    processDurationReference(process, now),
                  )
                }}
              </dd>
            </div>
          </dl>

          <footer class="processes-process-card-footer">
            <code :title="process.id">{{ process.id }}</code>
            <div class="processes-process-card-actions">
              <RouterLink
                :to="processDetailPath(process)"
                class="processes-detail-button"
              >
                Detalhes
              </RouterLink>
              <RouterLink
                :to="processLogPath(process)"
                class="processes-open-button"
                :aria-label="`Abrir logs de ${
                  projectNameById.get(process.projectId) ?? process.projectId
                }`"
                :title="`Abrir logs de ${
                  projectNameById.get(process.projectId) ?? process.projectId
                }`"
              >
                <ArrowTopRightOnSquareIcon aria-hidden="true" />
              </RouterLink>
            </div>
          </footer>
        </article>
      </div>
    </section>

    <details
      id="processes-diagnostics"
      ref="diagnosticsDetails"
      class="processes-diagnostics-details"
    >
      <summary>
        <span>
          <strong>Métricas detalhadas da API</strong>
          <small>Endpoints, deduplicação, falhas e histórico de alertas.</small>
        </span>
        <span class="processes-diagnostics-summary-action"
          >Abrir diagnóstico</span
        >
      </summary>
      <ApiRequestDiagnostics />
    </details>
  </section>
</template>

<style scoped>
.processes-empty-action {
  display: inline-flex;
  margin-top: 10px;
  color: var(--accent);
  font-size: 12px;
  font-weight: 700;
  text-decoration: none;
}

.processes-empty-action:hover,
.processes-empty-action:focus-visible {
  text-decoration: underline;
}
</style>
