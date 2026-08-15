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
  workspaces,
  projects,
  items,
  workspaceFilter,
  projectFilter,
  kindFilter,
  statusFilter,
  loading,
  referenceErrorMessage,
  processesErrorMessage,
  cleanupRunning,
  now,
  eligibleProjects,
  visibleItems,
  hasVisibleItems,
  activeCount,
  stoppedCount,
  failedCount,
  terminalCount,
  projectNameById,
  workspaceNameFor,
  loadProcesses,
  clearFilters,
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
    <dl
      v-if="!loading || items.length > 0"
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

    <div
      class="processes-filters"
      role="group"
      aria-label="Filtros de processos gerenciados"
    >
      <div class="processes-refresh-control">
        <div class="processes-refresh-actions">
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
      </div>
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
      {{
        items.length === 0
          ? 'Nenhum processo gerenciado no momento.'
          : 'Nenhum processo corresponde aos filtros escolhidos.'
      }}
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
