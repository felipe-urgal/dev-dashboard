<script setup lang="ts">
import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  TrashIcon,
} from '@heroicons/vue/24/outline';

import LoadingSkeleton from '../components/LoadingSkeleton.vue';
import StatusBadge from '../components/StatusBadge.vue';
import { useProcessesView } from '../composables/useProcessesView';
import {
  formatDuration,
  kindLabel,
  processDetailPath,
  processDurationReference,
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
  hasVisibleItems,
  terminalCount,
  projectNameById,
  workspaceNameFor,
  loadProcesses,
  runCleanup,
} = useProcessesView();
</script>

<template>
  <section
    id="processes"
    class="content processes-page"
    :aria-busy="loading"
    aria-label="Processos gerenciados"
  >
    <div class="processes-actions" role="group" aria-label="Ações de processos">
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
    </div>

    <p v-if="referenceErrorMessage" class="activity-error" role="alert">
      {{ referenceErrorMessage }}
    </p>
    <p v-if="processesErrorMessage" class="activity-error" role="alert">
      {{ processesErrorMessage }}
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
        !hasVisibleItems && !processesErrorMessage && !referenceErrorMessage
      "
      class="activity-empty"
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

    <div v-else class="processes-table-shell">
      <table class="processes-table">
        <caption class="sr-only">
          Processos gerenciados pelo dashboard
        </caption>
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
          <tr v-for="process in visibleItems" :key="process.id">
            <td data-label="Processo">
              <RouterLink
                :to="processDetailPath(process)"
                class="processes-table-title"
              >
                {{
                  projectNameById.get(process.projectId) ?? process.projectId
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
              <span v-if="process.port"> porta {{ process.port }} </span>
              <span v-else-if="process.pid"> PID {{ process.pid }} </span>
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
              <StatusBadge :tone="processToneFor(process.status)">
                {{ processStatusLabel(process.status) }}
              </StatusBadge>
            </td>
            <td class="processes-table-action" data-label="Ações">
              <RouterLink
                :to="processDetailPath(process)"
                class="processes-open-button"
                :aria-label="`Abrir detalhes de ${
                  projectNameById.get(process.projectId) ?? process.projectId
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

<style scoped>
.processes-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 4px 0;
}

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
