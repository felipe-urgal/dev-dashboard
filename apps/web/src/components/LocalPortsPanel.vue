
<script setup lang="ts">
import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  CpuChipIcon,
} from '@heroicons/vue/24/outline';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

import type {
  LocalPortEntry,
  LocalPortInspection,
  ManagedProcess,
} from '@dev-dashboard/contracts';

import {
  ApiRequestError,
  fetchLocalPorts,
} from '../api';
import { processDetailPath } from '../utils/process-format';
import StatusBadge from './StatusBadge.vue';
import type { StatusBadgeTone } from './status-badge-types';

const inspection = ref<LocalPortInspection | null>(null);
const loading = ref(false);
const errorMessage = ref('');

let controller: AbortController | undefined;
let generation = 0;

const entries = computed(() =>
  inspection.value?.entries ?? [],
);
const occupiedCount = computed(() =>
  entries.value.filter(
    (entry) => entry.state === 'occupied',
  ).length,
);
const conflictCount = computed(() =>
  entries.value.filter((entry) => entry.conflict).length,
);
const managedCount = computed(() =>
  entries.value.filter(
    (entry) => entry.managedProcess !== undefined,
  ).length,
);

function bindLabel(entry: LocalPortEntry): string {
  if (entry.address === '0.0.0.0' || entry.address === '::') {
    return 'Todas as interfaces';
  }
  return entry.address;
}

function statusLabel(entry: LocalPortEntry): string {
  if (entry.conflict) return 'Conflito';
  if (entry.state === 'available') return 'Livre';
  if (entry.managedProcess) return 'Gerenciado';
  return 'Ocupada';
}

function statusTone(entry: LocalPortEntry): StatusBadgeTone {
  if (entry.conflict) return 'danger';
  if (entry.state === 'available') return 'success';
  if (entry.managedProcess) return 'info';
  return 'warning';
}

function detailPath(entry: LocalPortEntry): string | null {
  if (entry.managedProcess) {
    const managed: ManagedProcess = {
      id: entry.managedProcess.id,
      projectId: entry.managedProcess.projectId,
      kind: entry.managedProcess.kind,
      status: entry.managedProcess.status,
    };
    return processDetailPath(managed);
  }

  const expected = entry.expected[0];
  return expected
    ? `/projects/${encodeURIComponent(expected.projectId)}/server`
    : null;
}

function detailLabel(entry: LocalPortEntry): string {
  if (entry.managedProcess) {
    return `Abrir processo de ${entry.managedProcess.projectName}`;
  }
  const expected = entry.expected[0];
  return expected
    ? `Abrir servidor de ${expected.projectName}`
    : 'Abrir detalhes';
}

async function loadPorts(): Promise<void> {
  controller?.abort();
  controller = new AbortController();
  const currentGeneration = ++generation;
  loading.value = true;
  errorMessage.value = '';

  try {
    const result = await fetchLocalPorts(controller.signal);
    if (currentGeneration !== generation) return;
    inspection.value = result;
  } catch (error) {
    if (controller.signal.aborted) return;
    if (currentGeneration !== generation) return;
    errorMessage.value =
      error instanceof ApiRequestError
        ? error.message
        : 'Não foi possível inspecionar as portas locais.';
  } finally {
    if (currentGeneration === generation) {
      loading.value = false;
    }
  }
}

onMounted(() => {
  void loadPorts();
});

onBeforeUnmount(() => {
  generation += 1;
  controller?.abort();
});
</script>

<template>
  <section
    class="local-ports-panel"
    aria-labelledby="local-ports-title"
    :aria-busy="loading"
  >
    <div class="local-ports-heading">
      <div class="local-ports-title-group">
        <CpuChipIcon aria-hidden="true" />
        <div>
          <span class="section-kicker">Somente leitura</span>
          <h3 id="local-ports-title">Portas locais</h3>
        </div>
      </div>

      <button
        type="button"
        class="processes-refresh-button"
        :disabled="loading"
        @click="loadPorts"
      >
        <ArrowPathIcon
          aria-hidden="true"
          :class="{ 'processes-refresh-icon-active': loading }"
        />
        {{ loading ? 'Atualizando…' : 'Atualizar portas' }}
      </button>
    </div>

    <p class="local-ports-note">
      Inspeção TCP no Linux para loopback e binds que também ocupam
      loopback. PIDs externos só aparecem quando pertencem ao usuário
      atual; nenhuma ação encerra processos externos.
    </p>

    <p
      v-if="loading && inspection"
      class="sr-only"
      role="status"
      aria-live="polite"
    >
      Atualizando portas locais…
    </p>

    <p
      v-if="errorMessage"
      class="activity-error"
      role="alert"
    >
      {{ errorMessage }}
    </p>

    <div
      v-if="loading && !inspection"
      class="activity-empty"
      role="status"
    >
      Consultando portas locais…
    </div>

    <div
      v-else-if="inspection?.status === 'unsupported'"
      class="activity-empty"
      role="status"
    >
      {{
        inspection.warning ??
          'O inspetor de portas está disponível somente no Linux.'
      }}
    </div>

    <div
      v-else-if="inspection?.status === 'unavailable'"
      class="activity-empty"
      role="status"
    >
      {{
        inspection.warning ??
          'A inspeção de portas não está disponível neste ambiente.'
      }}
    </div>

    <template v-else-if="inspection?.status === 'ready'">
      <dl
        class="processes-summary local-ports-summary"
        aria-label="Resumo das portas locais"
      >
        <div>
          <dt>Ocupadas</dt>
          <dd>{{ occupiedCount }}</dd>
        </div>
        <div>
          <dt>Gerenciadas</dt>
          <dd>{{ managedCount }}</dd>
        </div>
        <div>
          <dt>Conflitos</dt>
          <dd>{{ conflictCount }}</dd>
        </div>
        <div>
          <dt>Total</dt>
          <dd>{{ entries.length }}</dd>
        </div>
      </dl>

      <p
        v-if="inspection.truncated"
        class="local-ports-warning"
        role="status"
      >
        A lista foi limitada às 100 entradas mais relevantes.
      </p>

      <div
        v-if="entries.length === 0"
        class="activity-empty"
        role="status"
      >
        Nenhuma porta TCP relevante foi encontrada.
      </div>

      <div
        v-else
        class="processes-table-shell local-ports-table-shell"
      >
        <table class="processes-table local-ports-table">
          <caption class="sr-only">
            Portas TCP locais e processos associados
          </caption>
          <thead>
            <tr>
              <th scope="col">Porta</th>
              <th scope="col">Bind</th>
              <th scope="col">Processo</th>
              <th scope="col">Esperado por</th>
              <th scope="col">Estado</th>
              <th scope="col">
                <span class="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="entry in entries"
              :key="`${entry.address}:${entry.port}:${entry.externalProcess?.pid ?? entry.managedProcess?.id ?? 'free'}`"
            >
              <td data-label="Porta">
                <strong>{{ entry.port }}</strong>
              </td>
              <td data-label="Bind">
                {{ bindLabel(entry) }}
                <small v-if="entry.scope === 'all-interfaces'">
                  inclui loopback
                </small>
              </td>
              <td data-label="Processo">
                <span
                  v-if="entry.managedProcess"
                  class="local-ports-process"
                >
                  <strong>
                    {{ entry.managedProcess.projectName }}
                  </strong>
                  <small>Gerenciado pelo dashboard</small>
                </span>
                <span
                  v-else-if="entry.externalProcess"
                  class="local-ports-process"
                >
                  <strong>{{ entry.externalProcess.name }}</strong>
                  <small>PID {{ entry.externalProcess.pid }}</small>
                </span>
                <span v-else>Não identificado</span>
              </td>
              <td data-label="Esperado por">
                <span
                  v-if="entry.expected.length > 0"
                  class="local-ports-expected"
                >
                  <RouterLink
                    v-for="expected in entry.expected"
                    :key="expected.projectId"
                    :to="`/projects/${encodeURIComponent(expected.projectId)}/server`"
                  >
                    {{ expected.projectName }}
                  </RouterLink>
                </span>
                <span v-else>—</span>
              </td>
              <td data-label="Estado">
                <span class="local-ports-status">
                  <StatusBadge :tone="statusTone(entry)">
                    {{ statusLabel(entry) }}
                  </StatusBadge>
                  <small v-if="entry.suggestedPort">
                    Próxima livre: {{ entry.suggestedPort }}
                  </small>
                </span>
              </td>
              <td
                class="processes-table-action"
                data-label="Ações"
              >
                <RouterLink
                  v-if="detailPath(entry)"
                  :to="detailPath(entry) ?? '/processes'"
                  class="processes-open-button"
                  :aria-label="detailLabel(entry)"
                >
                  <ArrowTopRightOnSquareIcon aria-hidden="true" />
                </RouterLink>
                <span v-else>—</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </section>
</template>

<style scoped>
.local-ports-panel {
  display: grid;
  gap: var(--space-4);
  margin-top: var(--space-7);
  padding-top: var(--space-6);
  border-top: 1px solid var(--border);
}

.local-ports-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
}

.local-ports-title-group {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: var(--space-3);
}

.local-ports-title-group > svg {
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
  color: var(--accent);
}

.local-ports-title-group h3 {
  margin: 2px 0 0;
  color: var(--text);
  font-size: var(--font-xl);
}

.local-ports-note,
.local-ports-warning {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--font-sm);
  line-height: 1.6;
}

.local-ports-warning {
  color: var(--warning-text);
}

.local-ports-summary {
  margin: 0;
}

.local-ports-table-shell {
  margin-top: 0;
}

.local-ports-table td small,
.local-ports-table td > small {
  display: block;
  margin-top: 3px;
  color: var(--text-muted);
}

.local-ports-process,
.local-ports-status,
.local-ports-expected {
  display: grid;
  gap: 3px;
}

.local-ports-expected a {
  width: fit-content;
  color: var(--accent);
  text-decoration: none;
}

.local-ports-expected a:hover {
  text-decoration: underline;
}

@media (max-width: 760px) {
  .local-ports-heading {
    align-items: stretch;
    flex-direction: column;
  }

  .local-ports-heading .processes-refresh-button {
    width: 100%;
    justify-content: center;
  }
}
</style>
